#!/usr/bin/env python3
"""
Arr Language Auto-Tagger
=========================
Automatically assigns quality profiles to Radarr/Sonarr content based on original language.

Profile Assignment Logic:
- Content's original language is one you understand (en/de) → "Original Preferred" profile
- Content's original language is foreign (fr/ja/ko/etc) → "Dub Preferred" profile + "prefer-dub" tag

Features:
- Automatic language format detection (works with integer IDs, language codes, or names)
- Just use standard ISO 639-1 codes (en, de, fr, es, etc.) - script figures out the rest
- Configuration via config.yml
"""

import os
import sys
import time
import yaml
import requests
import logging
import schedule
import fcntl
from typing import List, Dict, Optional, Set
from pathlib import Path
from overseerr_integration import OverseerrInstance
from webhook_server import WebhookServer
from constants import INSECURE_BYPASS_TOKEN
from api_client import APIClient

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


class ProcessLock:
    """File-based lock to prevent concurrent execution."""

    def __init__(self, lock_file: str = '/tmp/arr-language-tagger.lock'):
        """Initialize lock with file path."""
        self.lock_file = lock_file
        self.lock_fd = None

    def acquire(self) -> bool:
        """
        Acquire lock. Returns True if acquired, False if another instance is running.

        This prevents multiple instances from modifying the same Radarr/Sonarr data
        simultaneously, which could cause race conditions or API conflicts.
        """
        try:
            self.lock_fd = open(self.lock_file, 'w')
            fcntl.flock(self.lock_fd.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.lock_fd.write(f"{os.getpid()}\n")
            self.lock_fd.flush()
            logger.info(f"Acquired process lock: {self.lock_file}")
            return True
        except IOError:
            logger.error(f"Another instance is already running (lock file: {self.lock_file})")
            logger.error("Wait for the other instance to complete, or remove the lock file if it's stale")
            return False
        except Exception as e:
            logger.error(f"Failed to acquire lock: {e}")
            return False

    def release(self):
        """Release the lock."""
        if self.lock_fd:
            try:
                fcntl.flock(self.lock_fd.fileno(), fcntl.LOCK_UN)
                self.lock_fd.close()
                os.remove(self.lock_file)
                logger.info(f"Released process lock: {self.lock_file}")
            except Exception as e:
                logger.warning(f"Failed to release lock cleanly: {e}")

    def __enter__(self):
        """Context manager entry."""
        if not self.acquire():
            raise RuntimeError("Could not acquire process lock")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit."""
        self.release()


class ArrInstance(APIClient):
    """Base class for Sonarr/Radarr instance management."""

    def __init__(self, name: str, service_type: str, config: dict):
        """Initialize Arr instance."""
        # Validate required fields
        base_url = config.get('base_url')
        api_key = config.get('api_key')

        if not base_url:
            raise ValueError(f"Instance '{name}': base_url is required")
        if not api_key:
            raise ValueError(f"Instance '{name}': api_key is required")

        # Initialize parent APIClient
        super().__init__(base_url, api_key, name)

        self.service_type = service_type  # 'radarr' or 'sonarr'
        self.enabled = config.get('enabled', True)

        # Tag and profile configuration
        self.tag_name = config.get('tag_name', 'prefer-dub')
        self.original_languages = config.get('original_languages', ['en', 'de'])
        self.original_profile_name = config.get('original_profile', 'Original Preferred')
        self.dub_profile_name = config.get('dub_profile', 'Dub Preferred')

        # Cache
        self.profile_ids = {}
        self.tag_id = None
        self.language_id_map = {}  # Maps API language IDs to our config values

        # Get dry-run mode from environment
        self.dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'

        # Rate limiting (seconds between updates)
        self.update_delay = float(os.environ.get('UPDATE_DELAY', '0.5'))

        # Triggered search configuration
        self.trigger_search_on_update = config.get('trigger_search_on_update', True)
        self.search_cooldown_seconds = config.get('search_cooldown_seconds', 60)
        self.min_search_interval_seconds = config.get('min_search_interval_seconds', 5)

        # Only process monitored items
        self.only_monitored = config.get('only_monitored', False)

        # Search tracking
        self.last_triggered_searches = {}  # {item_id: timestamp}
        self.last_any_search = 0

    def _get(self, endpoint: str, params: Optional[Dict] = None, **kwargs) -> dict:
        """Make GET request to Arr API (v3)."""
        return super()._get(f"api/v3/{endpoint}", params, **kwargs)

    def _post(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> dict:
        """Make POST request to Arr API (v3)."""
        return super()._post(f"api/v3/{endpoint}", data, **kwargs)

    def _put(self, endpoint: str, data: Optional[Dict] = None, **kwargs) -> dict:
        """Make PUT request to Arr API (v3)."""
        return super()._put(f"api/v3/{endpoint}", data, **kwargs)

    def trigger_search_for_item(self, item_id: int, endpoint: str) -> bool:
        """
        Trigger automatic search for specific item after profile update.

        Args:
            item_id: The movie or series ID
            endpoint: 'movie' or 'series'

        Returns:
            True if search was triggered, False if skipped
        """
        if not self.trigger_search_on_update:
            return False

        # Check per-item cooldown
        if item_id in self.last_triggered_searches:
            last_search = self.last_triggered_searches[item_id]
            time_since = time.time() - last_search
            if time_since < self.search_cooldown_seconds:
                logger.debug(f"[{self.name}] Skipping search for {endpoint} {item_id} "
                           f"(searched {time_since:.0f}s ago, cooldown: {self.search_cooldown_seconds}s)")
                return False

        # Check global search rate limit
        time_since_any = time.time() - self.last_any_search
        if time_since_any < self.min_search_interval_seconds:
            wait_time = self.min_search_interval_seconds - time_since_any
            logger.debug(f"[{self.name}] Waiting {wait_time:.1f}s for search rate limit...")
            time.sleep(wait_time)

        # Build search command
        if endpoint == 'movie':
            command = {
                'name': 'MoviesSearch',
                'movieIds': [item_id]
            }
        else:  # series
            command = {
                'name': 'SeriesSearch',
                'seriesId': item_id
            }

        # Execute search
        if self.dry_run:
            logger.info(f"[{self.name}] [DRY-RUN] Would trigger search: {command}")
            return False

        try:
            self._post('command', command)
            logger.info(f"[{self.name}] ✓ Triggered search for {endpoint} ID {item_id}")

            # Update tracking
            self.last_triggered_searches[item_id] = time.time()
            self.last_any_search = time.time()

            return True
        except Exception as e:
            logger.warning(f"[{self.name}] Failed to trigger search for {endpoint} {item_id}: {e}")
            return False

    def test_connection(self) -> bool:
        """Test API connection."""
        try:
            system_status = self._get("system/status")
            version = system_status.get('version', 'unknown')
            logger.info(f"[{self.name}] Connected to {self.service_type.capitalize()} v{version}")
            return True
        except Exception as e:
            logger.error(f"[{self.name}] Connection failed: {e}")
            return False

    def get_quality_profiles(self) -> None:
        """Fetch quality profile IDs and cache them."""
        logger.info(f"[{self.name}] Fetching quality profiles...")
        profiles = self._get("qualityprofile")

        for profile in profiles:
            # Case-insensitive comparison
            if profile['name'].lower() == self.original_profile_name.lower():
                self.profile_ids['original'] = profile['id']
                logger.info(f"[{self.name}] Found profile '{profile['name']}' → ID {profile['id']}")
            elif profile['name'].lower() == self.dub_profile_name.lower():
                self.profile_ids['dub'] = profile['id']
                logger.info(f"[{self.name}] Found profile '{profile['name']}' → ID {profile['id']}")

        if 'original' not in self.profile_ids:
            logger.error(f"[{self.name}] Quality profile '{self.original_profile_name}' not found!")
            logger.info(f"[{self.name}] Available profiles:")
            for profile in profiles:
                logger.info(f"[{self.name}]   - {profile['name']} → ID {profile['id']}")
            raise ValueError(f"Required profile '{self.original_profile_name}' does not exist")

        if 'dub' not in self.profile_ids:
            logger.error(f"[{self.name}] Quality profile '{self.dub_profile_name}' not found!")
            logger.info(f"[{self.name}] Available profiles:")
            for profile in profiles:
                logger.info(f"[{self.name}]   - {profile['name']} → ID {profile['id']}")
            raise ValueError(f"Required profile '{self.dub_profile_name}' does not exist")

    def build_language_mapping(self, items: List[Dict]) -> None:
        """
        Build a mapping from API language IDs to match user's configured languages.
        This allows flexible configuration - users can specify 'en', 'eng', 'English', or even integer IDs,
        and we'll match them against whatever format the API returns.
        """
        # Collect all unique language data from items
        api_languages = {}  # {id: name}
        for item in items[:50]:  # Sample first 50 items
            lang_obj = item.get('originalLanguage')
            if isinstance(lang_obj, dict):
                lang_id = lang_obj.get('id')
                lang_name = lang_obj.get('name', '').strip()
                if lang_id is not None and lang_name:
                    api_languages[lang_id] = lang_name

        if not api_languages:
            logger.warning(f"[{self.name}] No language data found in items, cannot build mapping")
            logger.warning(f"[{self.name}] Will use direct comparison (may not work correctly)")
            return

        # Map of common 2-letter codes to full names
        iso_639_1_map = {
            'en': 'english',
            'de': 'german', 'deu': 'german',
            'fr': 'french', 'fra': 'french',
            'es': 'spanish', 'spa': 'spanish',
            'it': 'italian', 'ita': 'italian',
            'ja': 'japanese', 'jpn': 'japanese',
            'ko': 'korean', 'kor': 'korean',
            'zh': 'chinese', 'zho': 'chinese',
            'ru': 'russian', 'rus': 'russian',
            'pt': 'portuguese', 'por': 'portuguese',
            'nl': 'dutch', 'nld': 'dutch',
            'sv': 'swedish', 'swe': 'swedish',
            'no': 'norwegian', 'nor': 'norwegian',
            'da': 'danish', 'dan': 'danish',
            'fi': 'finnish', 'fin': 'finnish',
            'pl': 'polish', 'pol': 'polish',
            'cs': 'czech', 'ces': 'czech',
            'hu': 'hungarian', 'hun': 'hungarian',
            'tr': 'turkish', 'tur': 'turkish',
            'ar': 'arabic', 'ara': 'arabic',
            'hi': 'hindi', 'hin': 'hindi',
            'hr': 'croatian', 'hrv': 'croatian',
        }

        # Build the mapping
        matched_ids = set()
        for config_lang in self.original_languages:
            # Normalize config value
            config_str = str(config_lang).lower().strip()

            # Try direct ID match first (if config is integer or numeric string)
            try:
                config_as_int = int(config_lang)
                if config_as_int in api_languages:
                    matched_ids.add(config_as_int)
                    logger.info(f"[{self.name}] Mapped '{config_lang}' -> API ID {config_as_int} ({api_languages[config_as_int]})")
                    continue
            except (ValueError, TypeError):
                pass

            # Try matching against language names from API
            # First resolve the config value to a language name using our map
            target_lang_name = iso_639_1_map.get(config_str, config_str)

            # Now find matching API IDs
            for api_id, api_name in api_languages.items():
                api_name_lower = api_name.lower().strip()

                # Exact match
                if api_name_lower == target_lang_name:
                    matched_ids.add(api_id)
                    logger.info(f"[{self.name}] Mapped '{config_lang}' -> API ID {api_id!r} ({api_name})")
                    break
                # Partial match (e.g., "english" matches "English (US)")
                elif target_lang_name in api_name_lower or api_name_lower in target_lang_name:
                    matched_ids.add(api_id)
                    logger.info(f"[{self.name}] Mapped '{config_lang}' -> API ID {api_id!r} ({api_name})")
                    break
            else:
                logger.warning(f"[{self.name}] Could not map configured language '{config_lang}' to any API language")
                logger.warning(f"[{self.name}] Available languages: {dict(list(api_languages.items())[:10])}")

        # Store the matched IDs
        self.language_id_map = matched_ids
        logger.info(f"[{self.name}] Language mapping complete: {len(matched_ids)} languages mapped")

    def ensure_tag_exists(self) -> None:
        """Ensure the tag exists."""
        logger.info(f"[{self.name}] Checking for tag '{self.tag_name}'...")
        tags = self._get("tag")

        for tag in tags:
            if tag['label'] == self.tag_name:
                self.tag_id = tag['id']
                logger.info(f"[{self.name}] Tag '{self.tag_name}' exists → ID {self.tag_id}")
                return

        # Create tag if it doesn't exist
        if self.dry_run:
            logger.info(f"[{self.name}] [DRY-RUN] Would create tag '{self.tag_name}'")
            self.tag_id = 999999  # Fake ID for dry-run
        else:
            logger.info(f"[{self.name}] Creating tag '{self.tag_name}'...")
            new_tag = self._post("tag", {"label": self.tag_name})
            self.tag_id = new_tag['id']
            logger.info(f"[{self.name}] Created tag '{self.tag_name}' → ID {self.tag_id}")

    def get_all_items(self) -> List[Dict]:
        """Fetch all items (movies/series) from instance."""
        endpoint = "movie" if self.service_type == "radarr" else "series"
        logger.info(f"[{self.name}] Fetching all {endpoint}...")
        items = self._get(endpoint)
        logger.info(f"[{self.name}] Found {len(items)} {endpoint}")
        return items

    def get_movie_files(self) -> List[Dict]:
        """Fetch all movie files with mediaInfo (Radarr only)."""
        if self.service_type != "radarr":
            logger.warning(f"[{self.name}] get_movie_files called on non-Radarr instance")
            return []
        return self._get("moviefile")

    def get_episode_files(self, series_id: int) -> List[Dict]:
        """Fetch episode files for a series with mediaInfo (Sonarr only)."""
        if self.service_type != "sonarr":
            logger.warning(f"[{self.name}] get_episode_files called on non-Sonarr instance")
            return []
        return self._get(f"episodefile?seriesId={series_id}")

    def find_item_by_tmdb_id(self, tmdb_id: int) -> Optional[Dict]:
        """
        Find a movie or series by TMDB ID.

        Args:
            tmdb_id: The TMDB ID to search for

        Returns:
            Item dict if found, None otherwise
        """
        try:
            endpoint = "movie" if self.service_type == "radarr" else "series"
            items = self._get(endpoint)

            for item in items:
                if self.service_type == "radarr":
                    # Radarr uses tmdbId
                    if item.get('tmdbId') == tmdb_id:
                        return item
                else:
                    # Sonarr uses tvdbId primarily, but also has tmdbId in some versions
                    # Check both to be safe
                    if item.get('tmdbId') == tmdb_id:
                        return item

            logger.debug(f"[{self.name}] No {endpoint} found with TMDB ID {tmdb_id}")
            return None

        except Exception as e:
            logger.error(f"[{self.name}] Error finding item by TMDB ID {tmdb_id}: {e}")
            return None

    def should_prefer_dub(self, item: Dict) -> bool:
        """Determine if item should prefer dubbed audio based on original language."""
        original_lang_obj = item.get('originalLanguage')

        # Type safety check
        if not isinstance(original_lang_obj, dict):
            title = item.get('title', 'Unknown')
            if original_lang_obj is None:
                logger.warning(f"[{self.name}] '{title}' has no original language info, defaulting to original preferred")
            else:
                logger.warning(f"[{self.name}] '{title}' has malformed originalLanguage field: {original_lang_obj}, defaulting to original preferred")
            return False

        original_lang = original_lang_obj.get('id')

        if not original_lang:
            title = item.get('title', 'Unknown')
            logger.warning(f"[{self.name}] '{title}' has no original language ID, defaulting to original preferred")
            return False

        # If we have a language mapping, use it; otherwise fall back to direct comparison
        if self.language_id_map:
            # If language ID is in our mapped set, it's an "original" language
            if original_lang in self.language_id_map:
                return False  # It's an original language, don't prefer dub

        # Fallback: direct comparison with configured language codes
        # This handles webhook scenarios where we get ISO codes like 'en', 'ko'
        # Convert to string and lowercase for comparison
        original_lang_str = str(original_lang).lower().strip()
        for config_lang in self.original_languages:
            config_str = str(config_lang).lower().strip()
            if original_lang_str == config_str:
                return False  # It's an original language, don't prefer dub

        # Not in original languages, prefer dub
        return True

    def update_item(self, item: Dict, add_tag: bool) -> bool:
        """Update item with appropriate tag and quality profile."""
        item_id = item['id']
        title = item['title']

        # Get language name for logging
        original_lang_obj = item.get('originalLanguage', {})
        if isinstance(original_lang_obj, dict):
            original_lang_name = original_lang_obj.get('name', 'Unknown')
        else:
            original_lang_name = 'Unknown'

        current_tags = set(item.get('tags', []))
        current_profile_id = item['qualityProfileId']

        needs_update = False
        changes = []
        new_tags = list(current_tags)
        new_profile_id = current_profile_id

        # Determine target state
        if add_tag:
            target_profile_id = self.profile_ids['dub']
            target_profile_name = self.dub_profile_name

            if self.tag_id not in current_tags:
                new_tags = list(current_tags | {self.tag_id})
                needs_update = True
                changes.append(f"add tag '{self.tag_name}'")
        else:
            target_profile_id = self.profile_ids['original']
            target_profile_name = self.original_profile_name

            if self.tag_id in current_tags:
                new_tags = list(current_tags - {self.tag_id})
                needs_update = True
                changes.append(f"remove tag '{self.tag_name}'")

        # Track if profile was changed
        profile_changed = False

        # Update profile if needed
        if current_profile_id != target_profile_id:
            new_profile_id = target_profile_id
            needs_update = True
            profile_changed = True
            changes.append(f"set profile to '{target_profile_name}'")

        if needs_update:
            if self.dry_run:
                logger.info(f"[{self.name}] [DRY-RUN] Would update '{title}' [{original_lang_name}]: {', '.join(changes)}")
                return False  # Don't count as updated in dry-run
            else:
                logger.info(f"[{self.name}] Updating '{title}' [{original_lang_name}]: {', '.join(changes)}")
                try:
                    endpoint = "movie" if self.service_type == "radarr" else "series"

                    # CRITICAL FIX: Only send fields we're modifying
                    # Get the full item first to preserve required fields
                    update_payload = item.copy()
                    update_payload['tags'] = new_tags
                    update_payload['qualityProfileId'] = new_profile_id

                    self._put(f"{endpoint}/{item_id}", update_payload)

                    # Rate limiting
                    if self.update_delay > 0:
                        time.sleep(self.update_delay)

                    # Trigger search if profile was changed
                    if profile_changed:
                        logger.debug(f"[{self.name}] Profile updated for '{title}', checking if search should be triggered...")
                        time.sleep(1)  # Brief delay to ensure update is processed
                        self.trigger_search_for_item(item_id, endpoint)

                    return True
                except Exception as e:
                    logger.error(f"[{self.name}] Failed to update '{title}': {e}")
                    return False

        return False

    def process_all_items(self) -> Dict[str, int]:
        """Process all items and update tags/profiles as needed."""
        logger.info(f"[{self.name}] Starting processing...")
        if self.only_monitored:
            logger.info(f"[{self.name}] Only processing monitored items")

        items = self.get_all_items()

        # Build smart language mapping
        logger.info(f"[{self.name}] Building language mapping...")
        self.build_language_mapping(items)

        updated_count = 0
        skipped_count = 0
        unmonitored_count = 0

        for idx, item in enumerate(items, 1):
            # Progress indicator for large libraries
            if idx % 100 == 0:
                logger.info(f"[{self.name}] Progress: {idx}/{len(items)} items processed")

            # Skip unmonitored items if configured
            if self.only_monitored and not item.get('monitored', True):
                unmonitored_count += 1
                continue

            prefer_dub = self.should_prefer_dub(item)

            if self.update_item(item, add_tag=prefer_dub):
                updated_count += 1
            else:
                skipped_count += 1

        if unmonitored_count > 0:
            logger.info(f"[{self.name}] Skipped {unmonitored_count} unmonitored items")

        return {
            'updated': updated_count,
            'skipped': skipped_count,
            'total': len(items)
        }

    def run(self) -> bool:
        """Main execution flow for this instance."""
        logger.info(f"[{self.name}] {'='*60}")
        logger.info(f"[{self.name}] Processing {self.service_type.capitalize()} instance")
        if self.dry_run:
            logger.info(f"[{self.name}] DRY-RUN MODE: No changes will be made")
        logger.info(f"[{self.name}] {'='*60}")

        try:
            # Test connection
            if not self.test_connection():
                logger.error(f"[{self.name}] Skipping due to connection failure")
                return False

            # Initialize
            self.get_quality_profiles()
            self.ensure_tag_exists()

            # Process all items
            stats = self.process_all_items()

            logger.info(f"[{self.name}] {'='*60}")
            logger.info(f"[{self.name}] Processing complete!")
            if self.dry_run:
                logger.info(f"[{self.name}]   Would update: {stats['updated']}")
            else:
                logger.info(f"[{self.name}]   Updated: {stats['updated']}")
            logger.info(f"[{self.name}]   Already correct: {stats['skipped']}")
            logger.info(f"[{self.name}]   Total: {stats['total']}")
            logger.info(f"[{self.name}] {'='*60}")

            return True

        except Exception as e:
            logger.error(f"[{self.name}] Processing failed: {e}", exc_info=True)
            return False


class AudioTagProcessor:
    """
    Processes audio track languages from mediaInfo and applies tags.

    Unlike profile assignment (which uses original language metadata),
    this inspects the actual mediaInfo of imported files to detect
    which audio tracks are present.
    """

    # Language name normalization map (various forms -> canonical name)
    LANGUAGE_ALIASES = {
        # German
        'de': 'german', 'deu': 'german', 'ger': 'german', 'german': 'german', 'deutsch': 'german',
        # English
        'en': 'english', 'eng': 'english', 'english': 'english',
        # French
        'fr': 'french', 'fra': 'french', 'fre': 'french', 'french': 'french', 'francais': 'french',
        # Spanish
        'es': 'spanish', 'spa': 'spanish', 'spanish': 'spanish', 'espanol': 'spanish',
        # Italian
        'it': 'italian', 'ita': 'italian', 'italian': 'italian', 'italiano': 'italian',
        # Japanese
        'ja': 'japanese', 'jpn': 'japanese', 'japanese': 'japanese',
        # Korean
        'ko': 'korean', 'kor': 'korean', 'korean': 'korean',
        # Chinese
        'zh': 'chinese', 'zho': 'chinese', 'chi': 'chinese', 'chinese': 'chinese', 'mandarin': 'chinese',
        # Russian
        'ru': 'russian', 'rus': 'russian', 'russian': 'russian',
        # Portuguese
        'pt': 'portuguese', 'por': 'portuguese', 'portuguese': 'portuguese',
        # Dutch
        'nl': 'dutch', 'nld': 'dutch', 'dut': 'dutch', 'dutch': 'dutch',
        # Polish
        'pl': 'polish', 'pol': 'polish', 'polish': 'polish',
        # Swedish
        'sv': 'swedish', 'swe': 'swedish', 'swedish': 'swedish',
        # Norwegian
        'no': 'norwegian', 'nor': 'norwegian', 'norwegian': 'norwegian',
        # Danish
        'da': 'danish', 'dan': 'danish', 'danish': 'danish',
        # Finnish
        'fi': 'finnish', 'fin': 'finnish', 'finnish': 'finnish',
        # Turkish
        'tr': 'turkish', 'tur': 'turkish', 'turkish': 'turkish',
        # Arabic
        'ar': 'arabic', 'ara': 'arabic', 'arabic': 'arabic',
        # Hindi
        'hi': 'hindi', 'hin': 'hindi', 'hindi': 'hindi',
        # Czech
        'cs': 'czech', 'ces': 'czech', 'cze': 'czech', 'czech': 'czech',
        # Hungarian
        'hu': 'hungarian', 'hun': 'hungarian', 'hungarian': 'hungarian',
        # Thai
        'th': 'thai', 'tha': 'thai', 'thai': 'thai',
        # Vietnamese
        'vi': 'vietnamese', 'vie': 'vietnamese', 'vietnamese': 'vietnamese',
    }

    def __init__(self, arr_instances: List[ArrInstance], instance_configs: Dict[str, Dict[str, dict]]):
        """
        Initialize audio tag processor.

        Args:
            arr_instances: List of initialized ArrInstance objects
            instance_configs: Dict of {service_type: {instance_name: instance_config}}
                              where instance_config contains 'audio_tags' list
        """
        # Store instances by service_type for lookup
        self.radarr_instances = {inst.name: inst for inst in arr_instances if inst.service_type == 'radarr'}
        self.sonarr_instances = {inst.name: inst for inst in arr_instances if inst.service_type == 'sonarr'}
        self.instance_configs = instance_configs
        self.dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'

        # Tag ID cache per instance: {service_type_name: {tag_name: tag_id}}
        self.tag_ids: Dict[str, Dict[str, int]] = {}

    @staticmethod
    def parse_audio_languages(media_info: Optional[Dict], languages_fallback: Optional[List[Dict]] = None) -> Set[str]:
        """
        Parse audioLanguages string from mediaInfo into normalized language set.

        Radarr/Sonarr return audioLanguages as a slash-separated string like:
        "English", "English / German", "Japanese/English"

        If mediaInfo.audioLanguages is empty, falls back to the languages field
        which Sonarr/Radarr parse from the release name.

        Args:
            media_info: The mediaInfo dict from the file
            languages_fallback: Optional list of language dicts (e.g., [{'id': 4, 'name': 'German'}])
                               Used as fallback when mediaInfo.audioLanguages is empty

        Returns:
            Set of normalized canonical language names (e.g., {'english', 'german'})
        """
        normalized = set()

        # Try mediaInfo.audioLanguages first (most accurate - from file metadata)
        audio_langs = ''
        if media_info:
            audio_langs = media_info.get('audioLanguages', '')

        if audio_langs:
            # Split by slash (handle both "English/German" and "English / German")
            raw_langs = [lang.strip().lower() for lang in audio_langs.split('/')]

            for lang in raw_langs:
                if not lang:
                    continue
                # Check if it's a known alias
                canonical = AudioTagProcessor.LANGUAGE_ALIASES.get(lang)
                if canonical:
                    normalized.add(canonical)
                else:
                    # Try partial matching for names like "english (us)"
                    for alias, canonical_name in AudioTagProcessor.LANGUAGE_ALIASES.items():
                        if alias in lang or lang in alias:
                            normalized.add(canonical_name)
                            break
                    else:
                        # Unknown language - keep as-is (lowercase)
                        normalized.add(lang)

        # Fallback to languages field if mediaInfo.audioLanguages was empty
        if not normalized and languages_fallback:
            for lang_obj in languages_fallback:
                if isinstance(lang_obj, dict):
                    lang_name = lang_obj.get('name', '').lower().strip()
                    if lang_name:
                        # Normalize using aliases
                        canonical = AudioTagProcessor.LANGUAGE_ALIASES.get(lang_name)
                        if canonical:
                            normalized.add(canonical)
                        else:
                            # Try partial matching
                            for alias, canonical_name in AudioTagProcessor.LANGUAGE_ALIASES.items():
                                if alias in lang_name or lang_name in alias:
                                    normalized.add(canonical_name)
                                    break
                            else:
                                normalized.add(lang_name)

        return normalized

    def ensure_tags_exist(self, instance: ArrInstance, tag_names: List[str]) -> Dict[str, int]:
        """
        Ensure all required tags exist for an instance.

        Args:
            instance: The ArrInstance to check/create tags on
            tag_names: List of tag names to ensure exist

        Returns:
            Dict mapping tag_name -> tag_id
        """
        if instance.name in self.tag_ids:
            # Check if we already have all needed tags cached
            cached = self.tag_ids[instance.name]
            if all(name in cached for name in tag_names):
                return cached

        # Fetch existing tags
        existing_tags = instance._get("tag")
        tag_map = {tag['label']: tag['id'] for tag in existing_tags}

        # Create missing tags
        for tag_name in tag_names:
            if tag_name not in tag_map:
                if self.dry_run:
                    logger.info(f"[{instance.name}] [DRY-RUN] Would create audio tag '{tag_name}'")
                    tag_map[tag_name] = 999999  # Fake ID for dry-run
                else:
                    logger.info(f"[{instance.name}] Creating audio tag '{tag_name}'...")
                    new_tag = instance._post("tag", {"label": tag_name})
                    tag_map[tag_name] = new_tag['id']
                    logger.info(f"[{instance.name}] Created tag '{tag_name}' -> ID {new_tag['id']}")

        # Cache the tag IDs
        self.tag_ids[instance.name] = tag_map
        return tag_map

    def update_item_tags(self, instance: ArrInstance, item: Dict, tags_to_add: Set[int], tags_to_remove: Set[int]) -> bool:
        """
        Update an item's tags (add/remove audio language tags).

        Args:
            instance: The ArrInstance to update
            item: The movie/series item dict
            tags_to_add: Set of tag IDs to add
            tags_to_remove: Set of tag IDs to remove

        Returns:
            True if item was updated, False otherwise
        """
        current_tags = set(item.get('tags', []))
        new_tags = (current_tags | tags_to_add) - tags_to_remove

        if new_tags == current_tags:
            return False  # No change needed

        item_id = item['id']
        title = item.get('title', 'Unknown')

        if self.dry_run:
            added = tags_to_add - current_tags
            removed = tags_to_remove & current_tags
            changes = []
            if added:
                changes.append(f"add {len(added)} tag(s)")
            if removed:
                changes.append(f"remove {len(removed)} tag(s)")
            logger.info(f"[{instance.name}] [DRY-RUN] Would update '{title}': {', '.join(changes)}")
            return False

        try:
            endpoint = "movie" if instance.service_type == "radarr" else "series"
            update_payload = item.copy()
            update_payload['tags'] = list(new_tags)
            instance._put(f"{endpoint}/{item_id}", update_payload)
            logger.info(f"[{instance.name}] Updated audio tags for '{title}'")
            return True
        except Exception as e:
            logger.error(f"[{instance.name}] Failed to update audio tags for '{title}': {e}")
            return False

    def process_radarr_instance(self, instance_name: str, tag_config: List[Dict]) -> Dict[str, int]:
        """
        Process a single Radarr instance for audio tagging.

        Args:
            instance_name: Name of the instance (must match config)
            tag_config: List of {language: str, tag_name: str} dicts

        Returns:
            Stats dict with 'updated', 'skipped', 'no_file' counts
        """
        if instance_name not in self.radarr_instances:
            logger.error(f"[audio_tags] Radarr instance '{instance_name}' not found")
            return {'updated': 0, 'skipped': 0, 'no_file': 0}

        instance = self.radarr_instances[instance_name]

        logger.info(f"[{instance_name}] Starting Radarr audio tag scan...")

        # Build language -> tag_name mapping and normalize languages
        lang_to_tag: Dict[str, str] = {}
        for mapping in tag_config:
            lang = mapping.get('language', '').lower()
            tag_name = mapping.get('tag_name', '')
            if lang and tag_name:
                # Normalize language to canonical form
                canonical = self.LANGUAGE_ALIASES.get(lang, lang)
                lang_to_tag[canonical] = tag_name

        if not lang_to_tag:
            logger.warning(f"[{instance_name}] No valid language-tag mappings configured")
            return {'updated': 0, 'skipped': 0, 'no_file': 0}

        # Ensure all tags exist
        tag_names = list(lang_to_tag.values())
        tag_map = self.ensure_tags_exist(instance, tag_names)

        # Build tag_id -> canonical_language reverse mapping for removal logic
        tag_id_to_lang: Dict[int, str] = {}
        for lang, tag_name in lang_to_tag.items():
            if tag_name in tag_map:
                tag_id_to_lang[tag_map[tag_name]] = lang

        # Fetch all movies (includes movieFile with mediaInfo)
        movies = instance.get_all_items()

        stats = {'updated': 0, 'skipped': 0, 'no_file': 0}

        for idx, movie in enumerate(movies, 1):
            if idx % 100 == 0:
                logger.info(f"[{instance_name}] Audio tag progress: {idx}/{len(movies)}")

            movie_file = movie.get('movieFile')
            if not movie_file:
                stats['no_file'] += 1
                continue

            media_info = movie_file.get('mediaInfo')
            languages_fallback = movie_file.get('languages')
            detected_langs = self.parse_audio_languages(media_info, languages_fallback)

            # Determine which tags should be present
            tags_to_add: Set[int] = set()
            tags_to_remove: Set[int] = set()

            for lang, tag_name in lang_to_tag.items():
                tag_id = tag_map.get(tag_name)
                if not tag_id:
                    continue

                if lang in detected_langs:
                    tags_to_add.add(tag_id)
                else:
                    tags_to_remove.add(tag_id)

            if self.update_item_tags(instance, movie, tags_to_add, tags_to_remove):
                stats['updated'] += 1
            else:
                stats['skipped'] += 1

        return stats

    def process_sonarr_instance(self, instance_name: str, tag_config: List[Dict]) -> Dict[str, int]:
        """
        Process a single Sonarr instance for audio tagging.

        For Sonarr, we check if ALL episodes have the language before tagging the series.

        Args:
            instance_name: Name of the instance (must match config)
            tag_config: List of {language: str, tag_name: str} dicts

        Returns:
            Stats dict with 'updated', 'skipped', 'no_file' counts
        """
        if instance_name not in self.sonarr_instances:
            logger.error(f"[audio_tags] Sonarr instance '{instance_name}' not found")
            return {'updated': 0, 'skipped': 0, 'no_file': 0}

        instance = self.sonarr_instances[instance_name]

        logger.info(f"[{instance_name}] Starting Sonarr audio tag scan...")

        # Build language -> tag_name mapping
        lang_to_tag: Dict[str, str] = {}
        for mapping in tag_config:
            lang = mapping.get('language', '').lower()
            tag_name = mapping.get('tag_name', '')
            if lang and tag_name:
                canonical = self.LANGUAGE_ALIASES.get(lang, lang)
                lang_to_tag[canonical] = tag_name

        if not lang_to_tag:
            logger.warning(f"[{instance_name}] No valid language-tag mappings configured")
            return {'updated': 0, 'skipped': 0, 'no_file': 0}

        # Ensure all tags exist
        tag_names = list(lang_to_tag.values())
        tag_map = self.ensure_tags_exist(instance, tag_names)

        # Fetch all series
        series_list = instance.get_all_items()

        stats = {'updated': 0, 'skipped': 0, 'no_file': 0}

        for idx, series in enumerate(series_list, 1):
            if idx % 50 == 0:
                logger.info(f"[{instance_name}] Audio tag progress: {idx}/{len(series_list)} series")

            series_id = series['id']

            # Fetch episode files for this series
            try:
                episode_files = instance.get_episode_files(series_id)
            except Exception as e:
                logger.warning(f"[{instance_name}] Failed to get episode files for series {series_id}: {e}")
                stats['no_file'] += 1
                continue

            if not episode_files:
                stats['no_file'] += 1
                continue

            # Collect languages that are present in ALL episodes (intersection)
            # Only tag the series if every episode has the language
            common_langs: Optional[Set[str]] = None
            for ep_file in episode_files:
                media_info = ep_file.get('mediaInfo')
                languages_fallback = ep_file.get('languages')
                detected = self.parse_audio_languages(media_info, languages_fallback)

                if common_langs is None:
                    common_langs = detected
                else:
                    common_langs &= detected  # Intersection

            all_detected_langs = common_langs or set()

            # Determine which tags should be present
            tags_to_add: Set[int] = set()
            tags_to_remove: Set[int] = set()

            for lang, tag_name in lang_to_tag.items():
                tag_id = tag_map.get(tag_name)
                if not tag_id:
                    continue

                if lang in all_detected_langs:
                    tags_to_add.add(tag_id)
                else:
                    tags_to_remove.add(tag_id)

            if self.update_item_tags(instance, series, tags_to_add, tags_to_remove):
                stats['updated'] += 1
            else:
                stats['skipped'] += 1

        return stats

    def run(self) -> None:
        """Run audio tag processing for all configured instances."""
        logger.info("="*80)
        logger.info("Audio Tag Processor - Starting scan")
        if self.dry_run:
            logger.info("[audio_tags] DRY-RUN MODE: No changes will be made")
        logger.info("="*80)

        # Process Radarr instances
        radarr_configs = self.instance_configs.get('radarr', {})
        for instance_name, instance_config in radarr_configs.items():
            audio_tags = instance_config.get('audio_tags', [])
            if audio_tags:
                stats = self.process_radarr_instance(instance_name, audio_tags)
                logger.info(f"[{instance_name}] Audio tag scan complete: "
                          f"{stats['updated']} updated, {stats['skipped']} unchanged, "
                          f"{stats['no_file']} without files")

        # Process Sonarr instances
        sonarr_configs = self.instance_configs.get('sonarr', {})
        for instance_name, instance_config in sonarr_configs.items():
            audio_tags = instance_config.get('audio_tags', [])
            if audio_tags:
                stats = self.process_sonarr_instance(instance_name, audio_tags)
                logger.info(f"[{instance_name}] Audio tag scan complete: "
                          f"{stats['updated']} updated, {stats['skipped']} unchanged, "
                          f"{stats['no_file']} without files")

        logger.info("="*80)
        logger.info("Audio Tag Processor - Scan complete")
        logger.info("="*80)


class ArrLanguageTagger:
    """Main application class."""

    def __init__(self, config_path: str):
        """Initialize application."""
        self.config_path = config_path
        self.config = self.load_config()
        self.validate_config()
        self.instances = []
        self.overseerr_instances = []
        self.webhook_server = None
        self.audio_tag_processor = None

        # Initialize instances
        self.init_instances()
        self.init_overseerr()
        self.init_webhook()
        self.init_audio_tags()

    def load_config(self) -> dict:
        """Load configuration from YAML file."""
        config_file = Path(self.config_path)

        if not config_file.exists():
            logger.error(f"Configuration file not found: {self.config_path}")
            sys.exit(1)

        try:
            with open(config_file, 'r') as f:
                config = yaml.safe_load(f)
                logger.info(f"Loaded configuration from {self.config_path}")
                return config
        except Exception as e:
            logger.error(f"Failed to load configuration: {e}")
            sys.exit(1)

    def validate_config(self) -> None:
        """Validate configuration structure."""
        if not self.config:
            logger.error("Configuration file is empty")
            sys.exit(1)

        # Check that at least one service is configured
        if 'radarr' not in self.config and 'sonarr' not in self.config:
            logger.error("Configuration must contain 'radarr' or 'sonarr' section")
            sys.exit(1)

    def get_env_override(self, service_type: str, instance_name: str, config_key: str, default=None):
        """Get configuration value from environment variable if available."""
        # For 'main' instance, check simple format first (RADARR_URL, RADARR_API_KEY)
        # This makes single-instance setup simpler
        if instance_name == 'main':
            # Map config_key to common env var names
            key_map = {
                'base_url': 'URL',
                'api_key': 'API_KEY'
            }
            simple_key = key_map.get(config_key, config_key.upper())
            simple_var_name = f"{service_type.upper()}_{simple_key}"
            env_value = os.environ.get(simple_var_name)

            if env_value:
                logger.info(f"Using environment variable {simple_var_name} for {service_type}.{instance_name}.{config_key}")
                return env_value

        # Fallback to instance-specific format: RADARR_MAIN_API_KEY, SONARR_TV_BASE_URL, etc.
        env_var_name = f"{service_type.upper()}_{instance_name.upper().replace('-', '_')}_{config_key.upper()}"
        env_value = os.environ.get(env_var_name)

        if env_value:
            logger.info(f"Using environment variable {env_var_name} for {service_type}.{instance_name}.{config_key}")
            return env_value

        return default

    def init_instances(self) -> None:
        """Initialize all Radarr and Sonarr instances from config."""
        # Initialize Radarr instances
        if 'radarr' in self.config:
            for name, config in self.config['radarr'].items():
                if config.get('enabled', True):
                    # Override with environment variables if available
                    config = config.copy()  # Don't modify original config
                    config['api_key'] = self.get_env_override('radarr', name, 'api_key', config.get('api_key'))
                    config['base_url'] = self.get_env_override('radarr', name, 'base_url', config.get('base_url'))

                    try:
                        logger.info(f"Initializing Radarr instance: {name}")
                        instance = ArrInstance(name, 'radarr', config)
                        self.instances.append(instance)
                    except ValueError as e:
                        logger.error(f"Failed to initialize Radarr instance '{name}': {e}")
                        sys.exit(1)
                else:
                    logger.info(f"Skipping disabled Radarr instance: {name}")

        # Initialize Sonarr instances
        if 'sonarr' in self.config:
            for name, config in self.config['sonarr'].items():
                if config.get('enabled', True):
                    # Override with environment variables if available
                    config = config.copy()  # Don't modify original config
                    config['api_key'] = self.get_env_override('sonarr', name, 'api_key', config.get('api_key'))
                    config['base_url'] = self.get_env_override('sonarr', name, 'base_url', config.get('base_url'))

                    try:
                        logger.info(f"Initializing Sonarr instance: {name}")
                        instance = ArrInstance(name, 'sonarr', config)
                        self.instances.append(instance)
                    except ValueError as e:
                        logger.error(f"Failed to initialize Sonarr instance '{name}': {e}")
                        sys.exit(1)
                else:
                    logger.info(f"Skipping disabled Sonarr instance: {name}")

        if not self.instances:
            logger.warning("No enabled instances found in configuration!")

    def init_overseerr(self) -> None:
        """Initialize Overseerr instances from config (optional)."""
        if 'overseerr' not in self.config:
            logger.info("Overseerr integration disabled (not in config)")
            return

        for name, config in self.config['overseerr'].items():
            if not config.get('enabled', True):
                logger.info(f"Skipping disabled Overseerr instance: {name}")
                continue

            # Override with environment variables if available
            config = config.copy()  # Don't modify original config
            config['api_key'] = self.get_env_override('overseerr', name, 'api_key', config.get('api_key'))
            config['base_url'] = self.get_env_override('overseerr', name, 'base_url', config.get('base_url'))

            try:
                logger.info(f"Initializing Overseerr instance: {name}")
                instance = OverseerrInstance(name, config, self.instances)
                self.overseerr_instances.append(instance)
            except ValueError as e:
                logger.error(f"Failed to initialize Overseerr instance '{name}': {e}")
                sys.exit(1)

        if self.overseerr_instances:
            logger.info(f"Initialized {len(self.overseerr_instances)} Overseerr instance(s)")

    def init_webhook(self) -> None:
        """Initialize webhook server from config (optional)."""
        if 'webhook' not in self.config:
            logger.info("Webhook server disabled (not in config)")
            return

        webhook_config = self.config['webhook']
        if not webhook_config.get('enabled', False):
            logger.info("Webhook server disabled (enabled=false)")
            return

        port = webhook_config.get('port', 5678)
        auth_token = webhook_config.get('auth_token', None)

        # Allow bypassing authentication requirement with environment variable (NOT RECOMMENDED)
        allow_insecure = os.environ.get('ALLOW_INSECURE_WEBHOOK', 'false').lower() == 'true'
        if allow_insecure and not auth_token:
            logger.warning("="*80)
            logger.warning("WARNING: Running webhook server WITHOUT authentication!")
            logger.warning("This is a SECURITY RISK and should only be used for testing.")
            logger.warning("Set 'webhook.auth_token' in config.yml for production use.")
            logger.warning("="*80)
            auth_token = INSECURE_BYPASS_TOKEN  # Use constant for testing bypass

        try:
            logger.info(f"Initializing webhook server on port {port}")
            self.webhook_server = WebhookServer(
                port=port,
                auth_token=auth_token,
                overseerr_instances=self.overseerr_instances,
                arr_instances=self.instances
            )
        except ValueError as e:
            logger.error(f"Failed to initialize webhook server: {e}")
            logger.error("Please set 'webhook.auth_token' in config.yml or disable webhooks.")
            sys.exit(1)
        except Exception as e:
            logger.error(f"Failed to initialize webhook server: {e}")
            sys.exit(1)

    def init_audio_tags(self) -> None:
        """Initialize audio tag processor from config (optional)."""
        # Check if any instance has audio_tags configured
        instance_configs = {
            'radarr': self.config.get('radarr', {}),
            'sonarr': self.config.get('sonarr', {})
        }

        has_audio_tags = False
        for service_type, instances in instance_configs.items():
            for instance_name, instance_config in instances.items():
                if instance_config.get('audio_tags'):
                    has_audio_tags = True
                    break
            if has_audio_tags:
                break

        if not has_audio_tags:
            logger.info("Audio tagging disabled (no audio_tags in any instance)")
            return

        try:
            logger.info("Initializing audio tag processor...")
            self.audio_tag_processor = AudioTagProcessor(self.instances, instance_configs)
            logger.info("Audio tag processor initialized")
        except Exception as e:
            logger.error(f"Failed to initialize audio tag processor: {e}")
            # Don't exit - audio tagging is optional

    def run_audio_tags(self) -> None:
        """Run audio tag processing."""
        if self.audio_tag_processor:
            try:
                self.audio_tag_processor.run()
            except Exception as e:
                logger.error(f"Error during audio tag processing: {e}", exc_info=True)

    def run_once(self) -> None:
        """Run processing once for all instances."""
        logger.info("="*80)
        logger.info("Arr Language Auto-Tagger - Starting sync")
        dry_run = os.environ.get('DRY_RUN', 'false').lower() == 'true'
        if dry_run:
            logger.info("DRY-RUN MODE ENABLED: No changes will be made")
        logger.info("="*80)

        # Process Overseerr requests first (if enabled)
        for overseerr in self.overseerr_instances:
            try:
                overseerr.process_pending_requests()
            except Exception as e:
                logger.error(f"Error processing Overseerr '{overseerr.name}': {e}", exc_info=True)

        # Then process Arr instances (safety net)
        success_count = 0
        failure_count = 0

        for instance in self.instances:
            if instance.run():
                success_count += 1
            else:
                failure_count += 1

        logger.info("="*80)
        logger.info(f"Sync complete: {success_count} successful, {failure_count} failed")
        logger.info("="*80)

        # Run audio tag processing after profile sync
        self.run_audio_tags()

    def run_scheduled(self) -> None:
        """Run on schedule."""
        schedule_config = self.config.get('schedule', {})
        interval_hours = schedule_config.get('interval_hours', 24)
        run_on_startup = schedule_config.get('run_on_startup', True)

        logger.info(f"Scheduling profile sync every {interval_hours} hours")

        # Start webhook server if configured
        if self.webhook_server:
            self.webhook_server.start()

        # Schedule profile sync job
        schedule.every(interval_hours).hours.do(self.run_once)

        # Schedule audio tag job (can have separate interval)
        if self.audio_tag_processor:
            audio_interval = schedule_config.get('audio_scan_interval_hours', 24)
            audio_on_startup = schedule_config.get('audio_scan_on_startup', True)

            if audio_interval != interval_hours:
                # Only schedule separately if interval differs
                logger.info(f"Scheduling audio tag scan every {audio_interval} hours")
                schedule.every(audio_interval).hours.do(self.run_audio_tags)

            if audio_on_startup and not run_on_startup:
                # Run audio tags on startup even if main sync doesn't
                logger.info("Running initial audio tag scan on startup...")
                self.run_audio_tags()

        # Run immediately on startup if configured
        if run_on_startup:
            logger.info("Running initial sync on startup...")
            self.run_once()

        # Keep running
        logger.info("Scheduler started. Press Ctrl+C to stop.")
        while True:
            schedule.run_pending()
            time.sleep(60)


def main():
    """Entry point."""
    config_path = os.environ.get('CONFIG_PATH', '/config/config.yml')
    lock_file = os.environ.get('LOCK_FILE', '/tmp/arr-language-tagger.lock')

    # Acquire lock to prevent concurrent runs
    lock = ProcessLock(lock_file)
    if not lock.acquire():
        logger.error("Exiting due to lock conflict")
        sys.exit(1)

    try:
        app = ArrLanguageTagger(config_path)

        # Check if we should run once or on schedule
        run_mode = os.environ.get('RUN_MODE', 'schedule')

        if run_mode == 'once':
            logger.info("Running in once mode")
            app.run_once()
        else:
            logger.info("Running in scheduled mode")
            app.run_scheduled()

    except KeyboardInterrupt:
        logger.info("Shutting down gracefully...")
        lock.release()
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal error: {e}", exc_info=True)
        lock.release()
        sys.exit(1)
    finally:
        lock.release()


if __name__ == "__main__":
    main()
