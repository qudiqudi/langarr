#!/usr/bin/env python3
"""
Webhook Server for Seerr/Overseerr Integration
===============================================
Receives webhook notifications from Seerr/Overseerr and processes requests in real-time.

Handles MEDIA_PENDING, MEDIA_AUTO_APPROVED and MEDIA_APPROVED events to update
profiles before the request is fully processed by Radarr/Sonarr. A request that a
person approves later only sends MEDIA_APPROVED, so that event must start the
profile update and the search as well.
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
from threading import Thread, Timer

from constants import INSECURE_BYPASS_TOKEN, SEARCH_FAILED

logger = logging.getLogger(__name__)

# Notification types that carry a media request
MEDIA_REQUEST_TYPES = ('MEDIA_PENDING', 'MEDIA_AUTO_APPROVED', 'MEDIA_APPROVED')
# Only an approved request may start a search. A pending request only gets its
# profile (if the item is there); the search follows with MEDIA_APPROVED.
APPROVED_TYPES = ('MEDIA_AUTO_APPROVED', 'MEDIA_APPROVED')

# Seerr sends the webhook while it adds the item to Radarr/Sonarr, so the item can
# be missing for some seconds. Approved requests retry the lookup with these waits
# (30.5 s plus the API time); a pending request is not in Radarr/Sonarr yet, one try.
ITEM_LOOKUP_DELAYS = (0.5, 1, 2, 4, 8, 15)

# An approved request whose search could not start (request or series not readable,
# item not in Radarr/Sonarr yet, command failed) is processed again after these waits.
RETRY_DELAYS = (60, 300, 900)


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
        self.is_insecure_mode = (allow_insecure and auth_token == INSECURE_BYPASS_TOKEN)
        self.overseerr_instances = overseerr_instances
        self.arr_instances = arr_instances
        # Process requests in a background thread, so a slow lookup (retries) does not
        # hold the HTTP response that Seerr waits for. Tests set this to False.
        self.process_async = True
        # Starts a delayed retry: (delay_seconds, function, payload). Tests replace it.
        self.retry_timer = self._start_timer

        # Create Flask app
        self.app = Flask(__name__)

        # Add rate limiting to prevent abuse
        self.limiter = Limiter(
            get_remote_address,
            app=self.app,
            default_limits=["200 per day", "50 per hour"],
            storage_uri="memory://"
        )

        # Apply stricter rate limit to webhook endpoint. Register the decorated
        # function, otherwise the webhook endpoint has no limit at all.
        limited_webhook = self.limiter.limit("20 per minute")(self.handle_webhook)
        self.app.add_url_rule('/webhook', 'webhook', limited_webhook, methods=['POST'])
        self.app.add_url_rule('/health', 'health', self.health_check, methods=['GET'])

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
        if notification_type in MEDIA_REQUEST_TYPES:
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

            # Internal retry keys (_langarr_*) are only set by schedule_retry, never by a sender
            if isinstance(payload, dict):
                payload = {k: v for k, v in payload.items() if not str(k).startswith('_langarr_')}

            # Validate payload structure
            is_valid, error_msg = self.validate_webhook_payload(payload)
            if not is_valid:
                logger.warning(f"Webhook request with invalid payload from {get_remote_address()}: {error_msg}")
                return jsonify({'error': error_msg}), 400

            notification_type = payload.get('notification_type')
            logger.info(f"Received webhook: {notification_type}")
            logger.debug(f"Webhook payload: {json.dumps(payload, indent=2)}")

            # Process relevant notification types
            if notification_type in MEDIA_REQUEST_TYPES:
                if self.process_async:
                    Thread(target=self.process_media_request, args=(payload,), daemon=True).start()
                else:
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
        3. Find item in Radarr/Sonarr by TMDB ID (with retries for approved requests)
        4. Update profile in Radarr/Sonarr, without the profile-change search
        5. For an approved request only: trigger one search (for a TV request the
           requested seasons, see ArrInstance._series_search_command)
        6. If the search of an approved request could not start, retry later
           (RETRY_DELAYS) for the instances that failed
        """
        try:
            # Extract media info
            media = payload.get('media', {})
            tmdb_id = media.get('tmdbId')
            media_type = media.get('media_type')  # 'movie' or 'tv'

            # Extract request info
            notification_type = payload.get('notification_type')
            request_data = payload.get('request', {})
            request_id = request_data.get('request_id')
            approved = notification_type in APPROVED_TYPES
            only_instances = payload.get('_langarr_only')  # set by a retry

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

            # Read the request once (get_request retries): it gives the target server
            # (is4k/serverId) and, for TV, the requested seasons. The webhook payload
            # carries neither. An unmapped movie request needs neither.
            mapping = overseerr.radarr_mapping if service_type == 'radarr' else overseerr.sonarr_mapping
            request_obj = None
            needs_request = bool(mapping) or media_type == 'tv'
            if needs_request and str(request_id or '').isdigit():
                request_obj = overseerr.get_request(int(request_id))

            seasons = self.requested_seasons(request_obj) if media_type == 'tv' else None
            if approved and needs_request and (request_obj is None or (media_type == 'tv' and not seasons)):
                # Without the request there is no target server, and for TV no season
                # scope: never fall back to a search of the whole series.
                logger.warning(f"Request {request_id}: could not read its server/seasons; no search at this time")
                self.schedule_retry(payload, only_instances, "request not readable")
                return

            arr_instances = self.select_arr_instances(overseerr, service_type, request_id, request_obj)
            if only_instances:
                arr_instances = [arr for arr in arr_instances if arr.name in only_instances]

            if not arr_instances:
                return

            attempts = len(ITEM_LOOKUP_DELAYS) if approved else 1
            failed = []

            # Process each arr instance
            for arr in arr_instances:
                logger.info(f"[{arr.name}] Processing webhook for {media_type} TMDB {tmdb_id}")

                # Determine correct profile
                fake_item = {'originalLanguage': {'id': original_language}}
                should_dub = arr.should_prefer_dub(fake_item)
                correct_profile_name = arr.dub_profile_name if should_dub else arr.original_profile_name

                logger.debug(f"[{arr.name}] Debug: original_language='{original_language}', should_dub={should_dub}, original_languages={arr.original_languages}, language_id_map={arr.language_id_map}")
                logger.info(f"[{arr.name}] {media_type} TMDB {tmdb_id}: {original_language} → {correct_profile_name}")

                # Find item in Radarr/Sonarr by TMDB ID. Seerr adds it at about the
                # same time as it sends the webhook, thus wait and retry.
                item = self.find_item_with_retry(arr, int(tmdb_id), attempts)
                if not item:
                    logger.warning(f"[{arr.name}] Could not find {media_type} with TMDB ID {tmdb_id} "
                                   f"after {attempts} attempt(s) (may not be added yet)")
                    if approved:
                        failed.append(arr.name)
                    continue

                item_id = item.get('id')
                current_title = item.get('title') or item.get('titleSlug') or 'Unknown'

                logger.info(f"[{arr.name}] Found {media_type} '{current_title}' (ID {item_id})")

                # Update the item with correct profile. No profile-change search here:
                # it would search the whole series and its cooldown would block the
                # scoped search below.
                if arr.update_item(item, add_tag=should_dub, search=False):
                    logger.info(f"[{arr.name}] ✓ Updated {media_type} ID {item_id} → {correct_profile_name}")
                else:
                    logger.info(f"[{arr.name}] No update needed for {media_type} ID {item_id}")

                if not approved:
                    logger.info(f"[{arr.name}] Request {request_id} is pending: profile prepared, "
                                f"the search follows with the approval")
                    continue

                # Trigger search for approved requests so the item starts downloading,
                # bypassing trigger_search_on_update since the request is explicit user intent.
                # For TV, search only the requested seasons.
                if arr.dispatch_search(item_id, endpoint, force=True, seasons=seasons) == SEARCH_FAILED:
                    failed.append(arr.name)

            if failed:
                self.schedule_retry(payload, failed, "search could not start")

        except Exception as e:
            logger.error(f"Error processing media request: {e}", exc_info=True)

    def schedule_retry(self, payload: Dict, instance_names: Optional[List[str]], reason: str):
        """Process an approved request again later, only for the instances that failed."""
        attempt = int(payload.get('_langarr_attempt', 0))
        request_id = (payload.get('request') or {}).get('request_id')
        if attempt >= len(RETRY_DELAYS):
            logger.warning(f"Request {request_id}: {reason}; giving up after {attempt} retries "
                           f"(search it manually, or the RSS sync finds new releases)")
            return
        retry = dict(payload)
        retry['_langarr_attempt'] = attempt + 1
        retry['_langarr_only'] = list(instance_names) if instance_names else None
        delay = RETRY_DELAYS[attempt]
        logger.info(f"Request {request_id}: {reason}; retry {attempt + 1}/{len(RETRY_DELAYS)} in {delay}s")
        self.retry_timer(delay, self.process_media_request, retry)

    @staticmethod
    def _start_timer(delay: float, function, payload: Dict):
        timer = Timer(delay, function, args=(payload,))
        timer.daemon = True
        timer.start()

    @staticmethod
    def find_item_with_retry(arr, tmdb_id: int, attempts: int) -> Optional[Dict]:
        """Find the item by TMDB ID; wait before each attempt (ITEM_LOOKUP_DELAYS)."""
        for delay in ITEM_LOOKUP_DELAYS[:max(1, attempts)]:
            time.sleep(delay)
            item = arr.find_item_by_tmdb_id(tmdb_id)
            if item:
                return item
        return None

    @staticmethod
    def requested_seasons(request_obj: Optional[Dict]) -> Optional[List[int]]:
        """Season numbers of a TV request, or None if the request does not list them."""
        if not request_obj:
            return None
        seasons = []
        for s in request_obj.get('seasons') or []:
            number = s.get('seasonNumber') if isinstance(s, dict) else s
            if isinstance(number, int):
                seasons.append(number)
        return sorted(set(seasons)) or None

    def select_arr_instances(self, overseerr, service_type: str, request_id, request_obj: Optional[Dict] = None) -> List:
        """
        Select the arr instances that a request is for.

        A 4K request must only touch the 4K instance (and a regular request only the
        regular one), otherwise every instance that already has the item gets a
        profile update and a search. The request's serverId/is4k (read from the
        Seerr API, the webhook payload does not carry them) decides the instance
        via the overseerr.<name>.radarr_servers / sonarr_servers mapping.

        Without a server mapping, all instances of the service type get the request
        (the behavior before the mapping existed). With a mapping, a request that
        cannot be read or resolved is skipped: sending it to all instances would
        change the profile of the same item in the wrong instance (for example the
        HD Radarr for a 4K request) and start a search there.
        """
        all_instances = [arr for arr in self.arr_instances if arr.service_type == service_type]

        if not all_instances:
            logger.warning(f"No {service_type} instances configured")
            return []

        mapping = overseerr.radarr_mapping if service_type == 'radarr' else overseerr.sonarr_mapping
        if not mapping:
            logger.debug(f"No {service_type} server mapping configured, processing all {service_type} instances")
            return all_instances

        if not request_obj:
            logger.warning(f"Could not read request {request_id}; skipping it (the scheduled run will process the item)")
            return []

        is4k = bool(request_obj.get('is4k'))
        server_id, arr = overseerr.resolve_arr_instance(service_type, request_obj.get('serverId'), is4k)

        if server_id is None:
            logger.warning(f"Request {request_id}: could not determine the target {service_type} server; skipping it")
            return []

        if not arr:
            logger.info(f"Request {request_id} ({'4K' if is4k else 'non-4K'}) goes to {service_type} server {server_id}, which has no langarr instance; skipping")
            return []

        logger.info(f"Request {request_id} ({'4K' if is4k else 'non-4K'}) → {service_type} server {server_id} → instance '{arr.name}'")
        return [arr]

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
