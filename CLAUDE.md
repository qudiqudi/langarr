# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Langarr** is an automatic quality profile management service for Radarr & Sonarr that assigns profiles based on content's original language. It's designed for multilingual libraries where you want original audio for some languages (e.g., English, German) but dubbed audio for foreign content (e.g., Korean, Japanese, French).

**Core Workflow:**
1. Recyclarr syncs quality profiles with custom formats to Radarr/Sonarr
2. Langarr assigns profiles (`Original Preferred` or `Dub Preferred`) based on original language
3. Service runs every 24 hours (configurable) to tag new content
4. Optional webhook support for instant updates on new Overseerr/Seerr requests

## Development Workflow

### Branch Strategy
- **main** - Stable production releases (protected, requires PR)
- **develop** - Integration/testing branch (debug features enabled)
- **feature/** - Feature development branches (merge to develop)

### Release Process
1. Work on `develop` branch or feature branches
2. Test with `:develop` Docker tag
3. Create PR from `develop` → `main`
4. Merge to main → triggers `:latest` build
5. Tag with `v1.x.x` → triggers versioned builds

### Docker Image Tags
- `latest` - Latest stable release (production)
- `v1.0.1` - Specific version (pinned/stable)
- `develop` - Development builds (testing/debug)

### Docker Build & Run
```bash
# Build Docker image locally
docker build -t langarr:local ./language-tagger

# Run with docker compose (using pre-built image)
docker compose up -d langarr
docker logs -f langarr

# Stop service
docker compose down langarr

# Use develop tag for testing
image: ghcr.io/qudiqudi/langarr:develop
```

### Testing

**Dry-run mode** (preview changes without applying):
```bash
docker exec langarr env DRY_RUN=true RUN_MODE=once python3 /app/arr-language-tagger.py
```

**Run once** (without scheduler):
```bash
docker exec langarr env RUN_MODE=once python3 /app/arr-language-tagger.py
```

### Configuration

Configuration is split between:
- **Environment variables** (in `.env` or `docker-compose.yml`): API keys, URLs
- **config.yml** (mounted at `/config/config.yml`): Language preferences, profile names, schedules

Example config structure at `language-tagger/config.yml`

## Architecture

### Core Components

**1. arr-language-tagger.py** (Main orchestrator)
- `ArrLanguageTagger`: Main application class
  - Loads config from `/config/config.yml`
  - Initializes Radarr/Sonarr instances
  - Optionally initializes Overseerr integration & webhook server
  - Manages scheduled runs (default: every 24 hours)
- `ArrInstance`: Base class for Radarr/Sonarr instance management
  - Handles API communication with Radarr/Sonarr
  - Detects language format (integer IDs, language codes, or names)
  - Assigns quality profiles based on original language
  - Triggers automatic searches after profile updates (configurable)
  - Rate limiting and cooldown management
- `ProcessLock`: File-based lock to prevent concurrent execution

**2. overseerr_integration.py**
- `OverseerrInstance`: Manages Overseerr/Seerr API integration
  - Gets original language from Overseerr's TMDB cache
  - Maps profile names to Overseerr profile IDs
  - Updates request `profileId` via API **before** sent to Radarr/Sonarr
  - Supports multiple Radarr/Sonarr server mappings

**3. webhook_server.py**
- `WebhookServer`: Flask-based webhook server
  - Listens for `MEDIA_PENDING` and `MEDIA_AUTO_APPROVED` events
  - Processes requests in real-time (vs 24-hour polling)
  - **Mandatory authentication** (multiple header formats supported)
    - `Authorization: <token>` (Seerr/Overseerr)
    - `Authorization: Bearer <token>`
    - `X-Auth-Token: <token>`
  - Rate limiting: 20 requests/minute
  - Runs in separate thread alongside scheduled sync
  - **Seerr compatibility**: Handles tmdbId as both string and integer

**4. AudioTagProcessor** (in arr-language-tagger.py)
- Tags media based on **actual audio tracks** in downloaded files (not original language metadata)
- Parses `mediaInfo.audioLanguages` from Radarr/Sonarr API (slash-separated string like "English / German")
- Normalizes language names (handles ISO codes, full names, variations)
- Adds/removes tags based on detected audio tracks
- For Sonarr: checks all episode files, tags series if ANY episode has the language
- Runs on configurable schedule (default: every 24 hours, same as profile sync)

### Configuration Structure

```yaml
schedule:
  interval_hours: 24
  run_on_startup: true
  audio_scan_interval_hours: 24   # Optional: separate interval for audio tagging
  audio_scan_on_startup: true

webhook:
  enabled: true
  port: 5678
  auth_token: "secure-random-token"  # REQUIRED for security (generate with: openssl rand -hex 32)

overseerr:
  main:  # Instance name
    enabled: true
    radarr_servers:
      0: main  # Overseerr server ID → langarr instance name
    sonarr_servers:
      0: main
    poll_interval_minutes: 10

radarr:
  main:  # Instance name (matches env var pattern)
    enabled: true
    # base_url and api_key loaded from RADARR_URL, RADARR_API_KEY
    tag_name: prefer-dub
    original_profile: Original Preferred
    dub_profile: Dub Preferred
    original_languages:
      - en
      - de
    trigger_search_on_update: true
    search_cooldown_seconds: 60
    min_search_interval_seconds: 5
    only_monitored: false  # Only process monitored items (default: false)

sonarr:
  main:
    # Same structure as radarr, plus optional audio_tags:
    audio_tags:
      - language: de
        tag_name: german-audio
```

### Environment Variable Patterns

**Single instance:**
```bash
RADARR_URL=http://radarr:7878
RADARR_API_KEY=...
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=...
```

**Multiple instances** (e.g., 4K, Anime):
```bash
RADARR_4K_URL=http://radarr-4k:7878
RADARR_4K_API_KEY=...
```
The instance name in config.yml must match the env var pattern (e.g., `radarr.4k` → `RADARR_4K_URL`)

### Profile Assignment Logic

The core logic in `ArrInstance`:

1. Fetch all content from Radarr/Sonarr
2. Detect language format (API returns different formats: integer IDs, ISO codes, or full names)
3. Build language mapping once per instance
4. For each item:
   - If original language in `original_languages` → assign `original_profile`
   - Otherwise → assign `dub_profile` + add `prefer-dub` tag
5. Optionally trigger automatic search after profile update (respects rate limits)

### Recyclarr Integration

Langarr **requires** two quality profiles managed by Recyclarr:
- **Original Preferred**: Scores dub-only releases lower (prefers original audio)
- **Dub Preferred**: Scores dub-only releases higher (prefers dubbed audio)

Key differentiator is language-specific custom format scoring (see `recyclarr/README.md`).

## Important Notes

### Code Characteristics
- **AI-Generated Code**: This codebase was built with AI assistance (Claude Code). Review changes carefully before production use.
- **Dry-run first**: Always test with `DRY_RUN=true` before applying changes to production.

### Testing Strategy
1. Test dry-run mode first: `DRY_RUN=true`
2. Verify profiles exist in Radarr/Sonarr: Settings → Profiles
3. Check logs for language detection issues
4. For webhooks: verify port 5678 is exposed and accessible

### Webhook Security
- **Authentication is mandatory by default** (v1.0.0+)
- Generate token: `openssl rand -hex 32`
- Add to config.yml: `webhook.auth_token`
- Configure in Seerr/Overseerr: Authorization Header with token value only
- For testing only: Set `ALLOW_INSECURE_WEBHOOK=true` env var (NOT recommended)
- Rate limiting: 20 requests/minute prevents DoS attacks
- Constant-time token comparison prevents timing attacks

### Multi-Instance Support
The codebase supports multiple Radarr/Sonarr instances (e.g., 4K, Anime separate servers). Instance names in config must match env var patterns.

### Language Detection
- Sonarr v4+ required for full language support
- Script auto-detects API language format (integer IDs, ISO codes, or full names)
- Uses ISO 639-1 codes in config (en, de, fr, ja, ko, etc.)

### Search Triggering
After updating profiles, the script can optionally trigger automatic searches in Radarr/Sonarr with:
- Per-item cooldown (default: 60s)
- Global rate limiting (default: 5s between searches)
- Configurable per instance

### Webhook Flow
```
User requests content in Overseerr
→ Webhook fires (MEDIA_PENDING/MEDIA_AUTO_APPROVED)
→ Langarr updates profile in Radarr/Sonarr
→ Triggers search
→ Downloads with correct quality profile
```

Without webhook: profiles updated every 24 hours (still works, just slower).

### Audio Track Tagging

Separate from profile assignment, audio tagging inspects downloaded files:

1. Fetches `movieFile.mediaInfo.audioLanguages` (Radarr) or `episodeFile.mediaInfo` (Sonarr)
2. Parses slash-separated language string (e.g., "English / German")
3. Normalizes language names using `LANGUAGE_ALIASES` mapping
4. Adds configured tags (e.g., `german-audio`) if language is detected
5. Removes tags if language is no longer present (file replaced)

**Configuration:** Add `audio_tags` list to any radarr/sonarr instance config:
```yaml
radarr:
  main:
    audio_tags:
      - language: de
        tag_name: german-audio
```

**Schedule settings** in `schedule` section: `audio_scan_interval_hours`, `audio_scan_on_startup`

**Use case:** Tag all content that has German audio, regardless of original language. Useful for filtering in Plex/Jellyfin.

**Difference from profile assignment:**
- Profile assignment: Uses TMDB original language metadata (pre-download)
- Audio tagging: Uses actual mediaInfo from downloaded files (post-download)
