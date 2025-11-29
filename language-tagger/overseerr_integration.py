#!/usr/bin/env python3
"""
Overseerr Integration for Langarr
==================================
Manages Overseerr API integration to set correct quality profiles on requests
before they are sent to Radarr/Sonarr.

Features:
- Process pending Overseerr requests
- Get original language from Overseerr's TMDB cache
- Map profile names to Overseerr profile IDs
- Update request profileId via API
"""

import os
import logging
import requests
import time
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


class OverseerrInstance:
    """Manages Overseerr API integration for profile assignment."""

    def __init__(self, name: str, config: dict, arr_instances: List):
        """Initialize Overseerr instance."""
        self.name = name

        # Validate required fields
        self.base_url = config.get('base_url') or os.environ.get('OVERSEERR_URL')
        self.api_key = config.get('api_key') or os.environ.get('OVERSEERR_API_KEY')

        if not self.base_url:
            raise ValueError(f"Overseerr '{name}': base_url not configured and OVERSEERR_URL env var not set")
        if not self.api_key:
            raise ValueError(f"Overseerr '{name}': api_key not configured and OVERSEERR_API_KEY env var not set")

        self.base_url = self.base_url.rstrip('/')
        self.enabled = config.get('enabled', True)

        # Session setup
        self.session = requests.Session()
        self.session.headers.update({
            'X-Api-Key': self.api_key,
            'Content-Type': 'application/json'
        })

        # Server mappings: {overseerr_server_id: ArrInstance}
        self.radarr_mapping = {}
        self.sonarr_mapping = {}

        # Build mappings from config and arr_instances
        self._build_arr_mappings(config, arr_instances)

        # Profile cache: {(service_type, server_id, profile_name): profile_id}
        self.profile_cache = {}

        # Polling interval for pending requests
        self.poll_interval_minutes = config.get('poll_interval_minutes', 10)

        # Get dry-run mode from environment
        self.dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'

        # Rate limiting
        self.update_delay = float(os.environ.get('UPDATE_DELAY', '0.5'))

    def _build_arr_mappings(self, config: dict, arr_instances: List):
        """Build mappings from Overseerr server IDs to ArrInstance objects."""
        radarr_config = config.get('radarr_servers', {})
        sonarr_config = config.get('sonarr_servers', {})

        # Create lookup dict: {service_type.instance_name: ArrInstance}
        arr_lookup = {}
        for instance in arr_instances:
            key = f"{instance.service_type}.{instance.name}"
            arr_lookup[key] = instance

        # Map Radarr servers
        for server_id, instance_name in radarr_config.items():
            key = f"radarr.{instance_name}"
            if key in arr_lookup:
                self.radarr_mapping[int(server_id)] = arr_lookup[key]
                logger.debug(f"[{self.name}] Mapped Radarr server {server_id} → {key}")
            else:
                logger.warning(f"[{self.name}] Radarr instance '{instance_name}' not found in arr_instances")

        # Map Sonarr servers
        for server_id, instance_name in sonarr_config.items():
            key = f"sonarr.{instance_name}"
            if key in arr_lookup:
                self.sonarr_mapping[int(server_id)] = arr_lookup[key]
                logger.debug(f"[{self.name}] Mapped Sonarr server {server_id} → {key}")
            else:
                logger.warning(f"[{self.name}] Sonarr instance '{instance_name}' not found in arr_instances")

    def _get(self, endpoint: str, params: dict = None) -> dict:
        """Make GET request to Overseerr API."""
        url = f"{self.base_url}/api/v1/{endpoint}"
        try:
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.name}] GET request failed for {endpoint}: {e}")
            raise

    def _put(self, endpoint: str, data: dict) -> dict:
        """Make PUT request to Overseerr API."""
        url = f"{self.base_url}/api/v1/{endpoint}"
        try:
            response = self.session.put(url, json=data, timeout=30)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            logger.error(f"[{self.name}] PUT request failed for {endpoint}: {e}")
            if hasattr(e, 'response') and e.response is not None:
                try:
                    error_body = e.response.json()
                    logger.error(f"[{self.name}] Error response: {error_body}")
                except:
                    logger.error(f"[{self.name}] Error response body: {e.response.text[:500]}")
            raise

    def test_connection(self) -> bool:
        """Test API connection."""
        try:
            logger.info(f"[{self.name}] Testing Overseerr connection...")
            status = self._get("status")
            version = status.get('version', 'unknown')
            logger.info(f"[{self.name}] ✓ Connected to Overseerr v{version}")
            return True
        except Exception as e:
            logger.error(f"[{self.name}] ✗ Connection failed: {e}")
            return False

    def get_pending_requests(self) -> List[Dict]:
        """Get all pending requests from Overseerr."""
        try:
            logger.info(f"[{self.name}] Fetching pending requests...")
            response = self._get("request", params={'filter': 'pending', 'take': 100})
            results = response.get('results', [])
            logger.info(f"[{self.name}] Found {len(results)} pending requests")
            return results
        except Exception as e:
            logger.error(f"[{self.name}] Failed to fetch pending requests: {e}")
            return []

    def get_media_language(self, media_type: str, tmdb_id: int) -> Optional[str]:
        """Get original language from Overseerr's cached TMDB data."""
        try:
            endpoint = f"{'movie' if media_type == 'movie' else 'tv'}/{tmdb_id}"
            media = self._get(endpoint)
            original_language = media.get('originalLanguage')

            if original_language:
                logger.debug(f"[{self.name}] TMDB {tmdb_id}: originalLanguage = {original_language}")
                return original_language
            else:
                logger.warning(f"[{self.name}] TMDB {tmdb_id}: No originalLanguage found")
                return None
        except Exception as e:
            logger.error(f"[{self.name}] Failed to get language for TMDB {tmdb_id}: {e}")
            return None

    def get_server_profiles(self, service_type: str, server_id: int) -> List[Dict]:
        """Get quality profiles from a Radarr/Sonarr server."""
        try:
            endpoint = f"service/{service_type}/{server_id}"
            server_data = self._get(endpoint)
            profiles = server_data.get('profiles', [])
            logger.debug(f"[{self.name}] {service_type} server {server_id}: {len(profiles)} profiles")
            return profiles
        except Exception as e:
            logger.error(f"[{self.name}] Failed to get profiles for {service_type} server {server_id}: {e}")
            return []

    def map_profile_name_to_id(self, service_type: str, server_id: int, profile_name: str) -> Optional[int]:
        """Map profile name to Overseerr's profile ID for a server."""
        # Check cache first
        cache_key = (service_type, server_id, profile_name)
        if cache_key in self.profile_cache:
            return self.profile_cache[cache_key]

        # Fetch profiles from Overseerr
        profiles = self.get_server_profiles(service_type, server_id)

        # Build cache for this server
        for profile in profiles:
            pid = profile.get('id')
            pname = profile.get('name')
            if pid and pname:
                key = (service_type, server_id, pname)
                self.profile_cache[key] = pid

        # Return the requested profile ID
        profile_id = self.profile_cache.get(cache_key)

        if profile_id:
            logger.debug(f"[{self.name}] Mapped '{profile_name}' → ID {profile_id}")
        else:
            logger.warning(f"[{self.name}] Profile '{profile_name}' not found on {service_type} server {server_id}")
            logger.debug(f"[{self.name}] Available profiles: {[p['name'] for p in profiles]}")

        return profile_id

    def determine_correct_profile(self, original_language: str, arr_instance) -> str:
        """Determine correct profile name based on language using ArrInstance logic."""
        # Create a fake item dict that matches what should_prefer_dub expects
        fake_item = {
            'originalLanguage': {
                'id': original_language
            }
        }

        # Use the ArrInstance's should_prefer_dub logic
        should_dub = arr_instance.should_prefer_dub(fake_item)

        # Return the appropriate profile name
        if should_dub:
            profile_name = arr_instance.dub_profile_name
            logger.debug(f"[{self.name}] Language '{original_language}' → {profile_name}")
        else:
            profile_name = arr_instance.original_profile_name
            logger.debug(f"[{self.name}] Language '{original_language}' → {profile_name}")

        return profile_name

    def update_request_profile(self, request_id: int, profile_id: int, media_type: str, seasons: list = None) -> bool:
        """Update a request's profileId via PUT API.

        Args:
            request_id: The request ID to update
            profile_id: The new profile ID
            media_type: 'movie' or 'tv'
            seasons: List of season numbers (required for TV shows)
        """
        try:
            if self.dry_run:
                logger.info(f"[{self.name}] [DRY-RUN] Would update request {request_id} → profileId {profile_id}")
                return True

            # Seerr/Overseerr requires mediaType in the PUT body
            # For TV shows, seasons field is also required
            body = {
                'mediaType': media_type,
                'profileId': profile_id
            }

            if media_type == 'tv' and seasons is not None:
                body['seasons'] = seasons

            self._put(f"request/{request_id}", body)
            logger.info(f"[{self.name}] ✓ Updated request {request_id} → profileId {profile_id}")
            time.sleep(self.update_delay)
            return True
        except Exception as e:
            logger.error(f"[{self.name}] Failed to update request {request_id}: {e}")
            return False

    def process_request(self, request: Dict) -> bool:
        """Process a single pending request."""
        request_id = request.get('id')
        media = request.get('media', {})
        tmdb_id = media.get('tmdbId')
        media_title = media.get('title', 'Unknown')

        # Determine media type
        media_type = 'movie' if request.get('type') == 1 else 'tv'

        # Get request's server ID
        server_id = request.get('serverId')

        logger.info(f"[{self.name}] Processing request {request_id}: '{media_title}' (type={request.get('type')}, serverId={server_id})")

        # Get the appropriate ArrInstance mapping
        if media_type == 'movie':
            service_type = 'radarr'
            mapping = self.radarr_mapping
        else:
            service_type = 'sonarr'
            mapping = self.sonarr_mapping

        # If no serverId, use the first (default) server in the mapping
        if not server_id:
            if not mapping:
                logger.info(f"[{self.name}] Request {request_id} has no serverId and no {service_type} servers configured")
                return False
            # Use the first server as default
            server_id = list(mapping.keys())[0]
            logger.info(f"[{self.name}] Request {request_id} has no serverId, using default {service_type} server {server_id}")

        arr_instance = mapping.get(server_id)

        if not arr_instance:
            logger.info(f"[{self.name}] Request {request_id}: No mapping for {service_type} server {server_id} (available: {list(mapping.keys())})")
            return False

        # Get original language from Overseerr
        original_language = self.get_media_language(media_type, tmdb_id)

        if not original_language:
            logger.warning(f"[{self.name}] Request {request_id}: Could not determine language")
            return False

        # Determine correct profile name
        correct_profile_name = self.determine_correct_profile(original_language, arr_instance)

        # Map profile name to ID
        profile_id = self.map_profile_name_to_id(service_type, server_id, correct_profile_name)

        if not profile_id:
            logger.error(f"[{self.name}] Request {request_id}: Could not map profile '{correct_profile_name}'")
            return False

        # Check if request already has the correct profile
        current_profile_id = request.get('profileId')
        if current_profile_id == profile_id:
            logger.debug(f"[{self.name}] Request {request_id} already has correct profile {profile_id}")
            return False

        # Update the request
        media_title = media.get('title', 'Unknown')
        logger.info(f"[{self.name}] Request {request_id} ('{media_title}'): {original_language} → {correct_profile_name}")

        # For TV shows, get the seasons from the request
        seasons = request.get('seasons') if media_type == 'tv' else None

        return self.update_request_profile(request_id, profile_id, media_type, seasons)

    def process_pending_requests(self):
        """Process all pending requests and update profileId."""
        if not self.enabled:
            logger.debug(f"[{self.name}] Overseerr integration disabled")
            return

        logger.info(f"[{self.name}] Processing pending Overseerr requests...")

        requests = self.get_pending_requests()

        if not requests:
            logger.info(f"[{self.name}] No pending requests to process")
            return

        updated_count = 0

        for request in requests:
            try:
                if self.process_request(request):
                    updated_count += 1
            except Exception as e:
                request_id = request.get('id', 'unknown')
                logger.error(f"[{self.name}] Error processing request {request_id}: {e}")

        logger.info(f"[{self.name}] Updated {updated_count}/{len(requests)} pending requests")
