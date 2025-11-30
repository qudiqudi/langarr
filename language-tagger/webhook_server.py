#!/usr/bin/env python3
"""
Webhook Server for Seerr/Overseerr Integration
===============================================
Receives webhook notifications from Seerr/Overseerr and processes requests in real-time.

Handles MEDIA_AUTO_APPROVED and MEDIA_PENDING events to update profiles before
the request is fully processed by Radarr/Sonarr.
"""

import logging
import json
import time
import hmac
import os
from flask import Flask, request, jsonify
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from typing import Dict, Optional, List, Tuple
from threading import Thread

logger = logging.getLogger(__name__)


class WebhookServer:
    """Flask-based webhook server for Seerr/Overseerr notifications."""

    def __init__(self, port: int, auth_token: Optional[str], overseerr_instances: List, arr_instances: List):
        """
        Initialize webhook server.

        Args:
            port: Port to listen on
            auth_token: Authentication token (required for security)
            overseerr_instances: List of OverseerrInstance objects
            arr_instances: List of ArrInstance objects

        Raises:
            ValueError: If auth_token is not provided
        """
        self.port = port

        # SECURITY: Enforce authentication token requirement
        # Special case: "INSECURE_BYPASS" is allowed when ALLOW_INSECURE_WEBHOOK=true is set
        if not auth_token or not auth_token.strip():
            raise ValueError(
                "Webhook authentication token is required for security. "
                "Set 'webhook.auth_token' in config.yml to a secure random string. "
                "To disable this check (NOT RECOMMENDED for production), set ALLOW_INSECURE_WEBHOOK=true"
            )

        self.auth_token = auth_token
        # Only enable insecure mode if BOTH conditions are met:
        # 1. Environment variable is explicitly set to true
        # 2. Token matches the bypass value
        allow_insecure = os.environ.get('ALLOW_INSECURE_WEBHOOK', 'false').lower() == 'true'
        self.is_insecure_mode = (allow_insecure and auth_token == "INSECURE_BYPASS")
        self.overseerr_instances = overseerr_instances
        self.arr_instances = arr_instances

        # Create Flask app
        self.app = Flask(__name__)
        self.app.add_url_rule('/webhook', 'webhook', self.handle_webhook, methods=['POST'])
        self.app.add_url_rule('/health', 'health', self.health_check, methods=['GET'])

        # Add rate limiting to prevent abuse
        self.limiter = Limiter(
            get_remote_address,
            app=self.app,
            default_limits=["200 per day", "50 per hour"],
            storage_uri="memory://"
        )

        # Apply stricter rate limit to webhook endpoint
        self.limiter.limit("20 per minute")(self.handle_webhook)

        # Disable Flask's default logger output
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)

        self.server_thread = None

    def health_check(self):
        """Health check endpoint."""
        return jsonify({'status': 'healthy'}), 200

    def validate_webhook_payload(self, payload: Dict) -> Tuple[bool, Optional[str]]:
        """
        Validate webhook payload structure and required fields.

        Args:
            payload: The webhook payload to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        if not isinstance(payload, dict):
            return False, "Payload must be a JSON object"

        # Validate notification_type exists and is a string
        notification_type = payload.get('notification_type')
        if not notification_type or not isinstance(notification_type, str):
            return False, "Missing or invalid 'notification_type' field"

        # For media notifications, validate required fields
        if notification_type in ['MEDIA_PENDING', 'MEDIA_AUTO_APPROVED']:
            media = payload.get('media')
            if not isinstance(media, dict):
                return False, "Missing or invalid 'media' field"

            tmdb_id = media.get('tmdbId')
            # Seerr/Overseerr may send tmdbId as string or int - handle both
            if isinstance(tmdb_id, str):
                try:
                    tmdb_id = int(tmdb_id)
                except (ValueError, TypeError):
                    return False, "Invalid 'media.tmdbId' field (cannot convert to integer)"

            if not isinstance(tmdb_id, int) or tmdb_id <= 0:
                return False, "Missing or invalid 'media.tmdbId' field (must be positive integer)"

            media_type = media.get('media_type')
            if media_type not in ['movie', 'tv']:
                return False, "Invalid 'media.media_type' field (must be 'movie' or 'tv')"

        return True, None

    def handle_webhook(self):
        """Handle incoming webhook from Seerr/Overseerr."""
        try:
            # Verify auth token (unless in insecure mode)
            if not self.is_insecure_mode:
                # Try multiple header formats for compatibility with different webhook senders
                provided_token = request.headers.get('X-Auth-Token')

                # Fallback: Check standard Authorization header (Bearer token)
                if not provided_token:
                    auth_header = request.headers.get('Authorization')
                    if auth_header and auth_header.startswith('Bearer '):
                        provided_token = auth_header[7:]  # Strip 'Bearer ' prefix

                # Fallback: Check Authorization header without Bearer prefix
                if not provided_token:
                    provided_token = request.headers.get('Authorization')

                if not provided_token:
                    logger.warning(f"Webhook request from {get_remote_address()} without auth token")
                    return jsonify({'error': 'Unauthorized - Auth token required'}), 401

                # Use constant-time comparison to prevent timing attacks
                if not hmac.compare_digest(provided_token, self.auth_token):
                    logger.warning(f"Webhook request from {get_remote_address()} with invalid auth token")
                    return jsonify({'error': 'Unauthorized - Invalid token'}), 401

            # Parse webhook payload
            try:
                payload = request.get_json(force=True)
            except Exception as e:
                logger.warning(f"Webhook request with invalid JSON from {get_remote_address()}: {e}")
                return jsonify({'error': 'Invalid JSON payload'}), 400

            if not payload:
                logger.warning(f"Webhook request with empty payload from {get_remote_address()}")
                return jsonify({'error': 'Empty payload'}), 400

            # Debug: Log raw payload to diagnose Seerr compatibility issues
            logger.info(f"Raw webhook payload from {get_remote_address()}: {json.dumps(payload, indent=2)}")

            # Validate payload structure
            is_valid, error_msg = self.validate_webhook_payload(payload)
            if not is_valid:
                logger.warning(f"Webhook request with invalid payload from {get_remote_address()}: {error_msg}")
                logger.warning(f"Failed payload structure: {json.dumps(payload, indent=2)}")
                return jsonify({'error': error_msg}), 400

            notification_type = payload.get('notification_type')
            logger.info(f"Received webhook: {notification_type}")
            logger.debug(f"Webhook payload: {json.dumps(payload, indent=2)}")

            # Process relevant notification types
            if notification_type in ['MEDIA_PENDING', 'MEDIA_AUTO_APPROVED']:
                self.process_media_request(payload)
            else:
                logger.debug(f"Ignoring notification type: {notification_type}")

            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logger.error(f"Error processing webhook: {e}", exc_info=True)
            return jsonify({'error': 'Internal server error'}), 500

    def process_media_request(self, payload: Dict):
        """
        Process media request from webhook.

        Flow:
        1. Extract TMDB ID and media type
        2. Determine correct profile using Overseerr instance logic
        3. Find item in Radarr/Sonarr by TMDB ID
        4. Update profile in both Seerr and Radarr/Sonarr
        5. Trigger search
        """
        try:
            # Extract media info
            media = payload.get('media', {})
            tmdb_id = media.get('tmdbId')
            media_type = media.get('media_type')  # 'movie' or 'tv'

            # Extract request info
            request_data = payload.get('request', {})
            request_id = request_data.get('request_id')

            if not tmdb_id or not media_type:
                logger.warning(f"Webhook missing tmdb_id or media_type: {payload}")
                return

            logger.info(f"Processing webhook for {media_type} TMDB {tmdb_id} (request {request_id})")

            # Get the first Overseerr instance (assuming single instance for now)
            if not self.overseerr_instances:
                logger.debug("No Overseerr instances configured, skipping webhook processing")
                return

            overseerr = self.overseerr_instances[0]

            # Get original language from Overseerr
            original_language = overseerr.get_media_language(media_type, int(tmdb_id))
            if not original_language:
                logger.warning(f"Could not determine language for TMDB {tmdb_id}")
                return

            # Determine service type and arr instances
            if media_type == 'movie':
                service_type = 'radarr'
                endpoint = 'movie'
            else:
                service_type = 'sonarr'
                endpoint = 'series'

            # Get all arr instances of the correct type
            arr_instances = [arr for arr in self.arr_instances if arr.service_type == service_type]

            if not arr_instances:
                logger.warning(f"No {service_type} instances configured")
                return

            # Process each arr instance
            for arr in arr_instances:
                logger.info(f"[{arr.name}] Processing webhook for {media_type} TMDB {tmdb_id}")

                # Determine correct profile
                fake_item = {'originalLanguage': {'id': original_language}}
                should_dub = arr.should_prefer_dub(fake_item)
                correct_profile_name = arr.dub_profile_name if should_dub else arr.original_profile_name

                logger.debug(f"[{arr.name}] Debug: original_language='{original_language}', should_dub={should_dub}, original_languages={arr.original_languages}, language_id_map={arr.language_id_map}")
                logger.info(f"[{arr.name}] {media_type} TMDB {tmdb_id}: {original_language} → {correct_profile_name}")

                # Find item in Radarr/Sonarr by TMDB ID
                # Give it a moment to be added by Seerr
                time.sleep(0.5)

                item = arr.find_item_by_tmdb_id(int(tmdb_id))
                if not item:
                    logger.warning(f"[{arr.name}] Could not find {media_type} with TMDB ID {tmdb_id} (may not be added yet)")
                    continue

                item_id = item.get('id')
                current_title = item.get('title') or item.get('titleSlug') or 'Unknown'

                logger.info(f"[{arr.name}] Found {media_type} '{current_title}' (ID {item_id})")

                # Update the item with correct profile
                if arr.update_item(item, add_tag=should_dub):
                    logger.info(f"[{arr.name}] ✓ Updated {media_type} ID {item_id} → {correct_profile_name}")

                    # Trigger search
                    arr.trigger_search_for_item(item_id, endpoint)
                else:
                    logger.debug(f"[{arr.name}] No update needed for {media_type} ID {item_id}")

        except Exception as e:
            logger.error(f"Error processing media request: {e}", exc_info=True)

    def start(self):
        """Start webhook server in background thread."""
        def run():
            logger.info(f"Starting webhook server on port {self.port}")
            self.app.run(host='0.0.0.0', port=self.port, threaded=True, use_reloader=False)

        self.server_thread = Thread(target=run, daemon=True)
        self.server_thread.start()
        logger.info(f"Webhook server started on http://0.0.0.0:{self.port}")

    def stop(self):
        """Stop webhook server."""
        # Flask doesn't have a clean shutdown, but since it's a daemon thread it will exit with main process
        logger.info("Webhook server stopping...")
