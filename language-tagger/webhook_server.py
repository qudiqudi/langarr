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
from flask import Flask, request, jsonify
from typing import Dict, Optional, List
from threading import Thread

logger = logging.getLogger(__name__)


class WebhookServer:
    """Flask-based webhook server for Seerr/Overseerr notifications."""

    def __init__(self, port: int, auth_token: Optional[str], overseerr_instances: List, arr_instances: List):
        """
        Initialize webhook server.

        Args:
            port: Port to listen on
            auth_token: Optional authentication token
            overseerr_instances: List of OverseerrInstance objects
            arr_instances: List of ArrInstance objects
        """
        self.port = port
        self.auth_token = auth_token
        self.overseerr_instances = overseerr_instances
        self.arr_instances = arr_instances

        # Create Flask app
        self.app = Flask(__name__)
        self.app.add_url_rule('/webhook', 'webhook', self.handle_webhook, methods=['POST'])
        self.app.add_url_rule('/health', 'health', self.health_check, methods=['GET'])

        # Disable Flask's default logger output
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)

        self.server_thread = None

    def health_check(self):
        """Health check endpoint."""
        return jsonify({'status': 'healthy'}), 200

    def handle_webhook(self):
        """Handle incoming webhook from Seerr/Overseerr."""
        try:
            # Verify auth token if configured
            if self.auth_token:
                provided_token = request.headers.get('X-Auth-Token')
                if provided_token != self.auth_token:
                    logger.warning("Webhook request with invalid auth token")
                    return jsonify({'error': 'Unauthorized'}), 401

            # Parse webhook payload
            payload = request.json
            if not payload:
                logger.warning("Webhook request with empty payload")
                return jsonify({'error': 'Empty payload'}), 400

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
            return jsonify({'error': str(e)}), 500

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
                current_title = item.get('title') or item.get('titleSlug', 'Unknown')

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
