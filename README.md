<div align="center">
  <img src="icon.png" alt="Langarr Logo" width="200"/>

  # Langarr
</div>

> **⚠️ CAUTION: AI-Generated Code**
>
> This project was developed with AI assistance (Claude Code). While functional, you should:
> - **Review all code** before running in production
> - **Verify environment variables** in `.env` match your setup
> - **Check `requirements.txt`** and all dependencies for security
> - **Test with dry-run mode first** (`DRY_RUN=true`) before making changes
> - **Backup your Radarr/Sonarr databases** before use
>
> Use at your own risk. No warranties provided.

**Language-based automatic profile management for Radarr & Sonarr**

Langarr automatically assigns quality profiles based on a movie/show's original language. Perfect for multilingual media libraries where you want dubbed audio for foreign content but original audio for select languages.

**Default Configuration:** Ships with German dub setup using TRaSH Guide's German custom formats. The language detection system works with any language - see [Adapting for Other Languages](#adapting-for-other-languages) to configure for French, Spanish, Italian, or your preferred language.

## What It Does

1. **Recyclarr** creates two quality profiles in your Radarr/Sonarr:
   - `Original Preferred` - Prefers releases with original audio track (scores dub-only releases lower)
   - `Dub Preferred` - Prefers releases with dubbed audio (scores dub-only releases higher)

2. **Language Tagger** automatically assigns the correct profile based on content's original language:
   - Original language is one you understand (en/de) → `Original Preferred` (keep original audio)
   - Original language is foreign (fr/ja/ko/etc) → `Dub Preferred` + `prefer-dub` tag (get dub)
   - The `prefer-dub` tag helps you filter and identify foreign content in your library

3. Runs automatically every 24 hours to tag new content

## Prerequisites

Langarr integrates into your existing media stack. You need:

- **Radarr** v3+ (v4+ recommended) and/or **Sonarr** v3+ (v4 required for full language support)
- **Recyclarr** already configured and running in your docker-compose stack
- **Docker** & **Docker Compose** with your services on a shared network
- **API Keys** from Radarr/Sonarr (Settings → General → Security → API Key)

## Installation

Langarr is designed to integrate into your existing docker-compose stack.

### Step 1: Clone the repository

```bash
git clone https://github.com/qudiqudi/langarr.git /path/to/langarr
cd /path/to/langarr
```

### Step 2: Configure recyclarr profiles

Langarr requires two quality profiles: `Original Preferred` and `Dub Preferred`.

**Choose your approach:**

- **New to recyclarr?** Copy the full example:
  ```bash
  cp recyclarr/recyclarr-full-example.yml /path/to/your/recyclarr/config/recyclarr.yml
  ```

- **Existing recyclarr config?** See [`recyclarr/README.md`](recyclarr/README.md) for how to ADD the profiles to your existing configuration without losing your custom formats.

**After updating your config, sync recyclarr:**

```bash
docker exec recyclarr recyclarr sync
```

Verify the profiles were created: **Radarr/Sonarr → Settings → Profiles**
- You should see `Original Preferred` and `Dub Preferred`

### Step 3: Add langarr-tagger to your docker-compose.yml

Copy the service from `docker-compose.yml` into your existing stack's docker-compose file. Update these values:

```yaml
services:
  langarr-tagger:
    build: /path/to/langarr/language-tagger  # Path where you cloned langarr
    # ... rest of the service definition ...
    volumes:
      - /path/to/langarr/language-tagger:/config:ro  # Same path as build
    networks:
      - your_network_name  # Your existing docker network (e.g., t2_proxy)
```

### Step 4: Configure languages

Edit `language-tagger/config.yml` to set your preferred "original" languages:

```yaml
original_languages:
  - en  # English
  - de  # German
  # Add more as needed
```

### Step 5: Start the language-tagger

```bash
# From your main docker-compose directory
docker-compose up -d langarr-tagger

# Monitor the logs
docker logs -f langarr-tagger
```

### What Happens Next?

1. **Language Tagger runs** (~5-30 seconds depending on library size):
   - Analyzes each movie/show's original language from Radarr/Sonarr
   - Assigns `Original Preferred` profile to content in your configured languages
   - Assigns `Dub Preferred` profile + `prefer-dub` tag to foreign content

2. **Verify it worked:**
   - Check Radarr/Sonarr UI for the new tag `prefer-dub`
   - Foreign language content should have "Dub Preferred" profile
   - Native language content (en/de by default) should have "Original Preferred" profile

3. **Auto-updates:** Runs every 24 hours to automatically tag new additions

## Configuration

### Environment Variables

The langarr-tagger service uses your existing environment variables (likely already defined for recyclarr):

- `TZ` - Timezone for logs
- `RADARR_URL` - Radarr URL (e.g., `http://radarr:7878`)
- `RADARR_API_KEY` - Your Radarr API key
- `SONARR_URL` - Sonarr URL (e.g., `http://sonarr:8989`)
- `SONARR_API_KEY` - Your Sonarr API key

These are typically already in your `.env` file or defined in your docker-compose. The langarr-tagger service will inherit them.

**Optional:** Set `DRY_RUN=true` to preview changes without applying them (useful for testing).

### Language Configuration (language-tagger/config.yml)

Configure which languages should keep their original audio:

```yaml
original_languages:
  - en  # English
  - de  # German
  # Add more languages as needed:
  # - fr  # French
  # - ja  # Japanese (for anime)
  # - es  # Spanish
```

The script uses automatic format detection - just use standard 2-letter ISO 639-1 codes (en, de, fr, es, it, ja, ko, zh, etc.).

### Multiple Radarr/Sonarr Instances

Langarr supports multiple instances (e.g., separate 4K Radarr, Anime Sonarr):

1. **Add to `.env`:**
   ```bash
   RADARR_4K_URL=http://radarr-4k:7878
   RADARR_4K_API_KEY=your_4k_api_key

   SONARR_ANIME_URL=http://sonarr-anime:8989
   SONARR_ANIME_API_KEY=your_anime_api_key
   ```

2. **Add to `language-tagger/config.yml`:**
   ```yaml
   radarr:
     main:
       enabled: true
       # ... existing config ...

     4k:  # Instance name matches env var: RADARR_4K_*
       enabled: true
       tag_name: prefer-dub
       original_profile: Original Preferred
       dub_profile: Dub Preferred
       original_languages:
         - en
         - de
   ```

3. **Add to `recyclarr/recyclarr.yml`:** Duplicate the configuration for each instance

### Custom Profile Names

If you want different profile names, edit `recyclarr/recyclarr.yml` and `language-tagger/config.yml` to match.

## Overseerr Integration (Optional)

Langarr can optionally integrate with Overseerr to automatically set correct quality profiles on requests **BEFORE** they are sent to Radarr/Sonarr.

### Why Use Overseerr Integration?

**Without Overseerr Integration:**
- Langarr updates profiles in Radarr/Sonarr every 24 hours
- Wrong profile might be used initially, then corrected later

**With Overseerr Integration:**
- Manual requests: ProfileId updated in Overseerr before approval ✨
- Auto-approved requests: Profile updated in Radarr/Sonarr within 2-5 minutes + automatic search triggered 🚀
- Downloads start with the **correct quality immediately**

### ⚠️ CRITICAL: Required Overseerr Settings

To prevent wrong quality downloads (especially with auto-approve), you **MUST** disable automatic search in Overseerr:

#### Step 1: Disable "Enable Automatic Search" in Overseerr

**For each Radarr/Sonarr server in Overseerr:**

1. Go to **Overseerr → Settings → Services**
2. Click on your **Radarr** server
3. **UNCHECK** ❌ "Enable Automatic Search"
4. Click **Save Changes**
5. Repeat for **Sonarr** servers

![Overseerr Settings](docs/overseerr-disable-search.png)

**What this does:**
- Items are added to Radarr/Sonarr as "monitored" but **NOT searched immediately**
- Langarr has time to set the correct profile
- Langarr triggers search after profile is aligned
- Downloads start with correct quality ✅

#### Step 2: Verify RSS Sync is Enabled in Radarr/Sonarr

**In Radarr:**
1. Go to **Settings → Indexers**
2. For each indexer, ensure **"Enable RSS Sync"** is checked ✅
3. RSS Sync Interval: **15-30 minutes** recommended

Repeat for Sonarr.

**Result:** Downloads start 2-5 minutes after approval with correct profile (via triggered search), with RSS Sync as a backup.

### Configuration

#### 1. Add Environment Variables

Add to your `.env` file:

```bash
# Overseerr (optional)
OVERSEERR_URL=http://overseerr:5055
OVERSEERR_API_KEY=your-overseerr-api-key-here
```

**Finding your Overseerr API Key:**
- Overseerr → Settings → General → API Key

#### 2. Update `language-tagger/config.yml`

Add the `overseerr` section:

```yaml
# Overseerr Integration (OPTIONAL - remove this section to disable)
overseerr:
  main:                     # Instance name
    enabled: true           # Set to false to disable

    # Connection loaded from env: OVERSEERR_URL, OVERSEERR_API_KEY

    # Map Overseerr server IDs to langarr instance names
    # To find server IDs: Overseerr → Settings → Services → click server → check URL
    # Example: /settings/services/radarr/1 ← server ID is 1
    radarr_servers:
      1: main               # Overseerr Radarr server ID 1 → langarr radarr.main
      # 2: 4k               # Example: Multiple servers

    sonarr_servers:
      1: main               # Overseerr Sonarr server ID 1 → langarr sonarr.main
      # 2: 4k               # Example: Multiple servers
```

**Finding Overseerr Server IDs:**

1. Go to **Overseerr → Settings → Services**
2. Click on a Radarr/Sonarr server
3. Look at the URL: `/settings/services/radarr/1` ← Server ID is **1**
4. Use this number in your `radarr_servers` mapping

#### 3. (Optional) Adjust Search Behavior

In `config.yml`, you can configure triggered search behavior:

```yaml
radarr:
  main:
    # ... existing config ...

    # Triggered Search Options (defaults shown)
    trigger_search_on_update: true      # Auto-search after profile update
    search_cooldown_seconds: 60         # Don't search same item within 60s
    min_search_interval_seconds: 5      # Min time between ANY searches
```

### How It Works

#### For Manual Approvals:
```
1. User requests "Parasite" (Korean movie)
2. Langarr detects pending request in Overseerr
3. Langarr updates profileId to "Dub Preferred" in Overseerr
4. Admin approves request
5. Overseerr sends to Radarr with correct profile ✅
6. Download starts immediately with correct quality
```

#### For Auto-Approved Requests:
```
1. User requests "Parasite" (auto-approve enabled)
2. Overseerr instantly approves and sends to Radarr (default profile, NO search)
3. Langarr runs (every 24 hours, or on-demand)
4. Langarr detects new movie, updates profile to "Dub Preferred"
5. Langarr triggers MoviesSearch command in Radarr
6. Radarr searches indexers and downloads with correct quality ✅
```

**Timing:**
- Without Overseerr: Profile corrected within 24 hours (next scheduled run)
- With Overseerr: Profile corrected + search triggered within 2-5 minutes 🚀

### Disabling Overseerr Integration

To disable, either:
- Set `enabled: false` in config
- Remove the `overseerr` section entirely from `config.yml`

Langarr will work normally, updating profiles directly in Radarr/Sonarr only.

### Troubleshooting

**Q: Auto-approved requests download wrong quality**
- **A:** Did you disable "Enable Automatic Search" in Overseerr Settings → Services? This is **REQUIRED**.

**Q: Downloads don't start after profile update**
- **A:** Check that RSS Sync is enabled in Radarr/Sonarr indexer settings
- **A:** Verify `trigger_search_on_update: true` in config (default)
- **A:** Check logs: `docker logs langarr-tagger | grep "Triggered search"`

**Q: Langarr can't connect to Overseerr**
- **A:** Verify `OVERSEERR_URL` and `OVERSEERR_API_KEY` in your `.env` file
- **A:** Test connectivity: `docker exec langarr-tagger curl http://overseerr:5055/api/v1/status`
- **A:** Ensure containers are on the same Docker network

**Q: Profile mapping not working**
- **A:** Verify server IDs match: Overseerr → Settings → Services → check URL
- **A:** Ensure profile names match exactly: "Original Preferred" and "Dub Preferred"
- **A:** Check logs for mapping errors: `docker logs langarr-tagger | grep "Mapped"`

**Q: Triggered searches not working**
- **A:** Verify Radarr/Sonarr API connectivity
- **A:** Check indexer configuration (at least one indexer with "Enable Automatic Search")
- **A:** View logs: `docker logs langarr-tagger | grep "search"`

## How It Works

1. **Initial Setup**: Recyclarr syncs quality profiles and custom formats to Radarr/Sonarr
2. **Auto-Assignment**: Language tagger reads each item's original language from the API
3. **Smart Mapping**: Automatically detects language ID format (integers, codes, etc.)
4. **Profile Assignment**:
   - Native language content → "Original Preferred"
   - Foreign language content → "Dub Preferred" + tag
5. **Continuous**: Runs every 24 hours to process new content

## Custom Formats Explained

The default recyclarr configuration (German setup) includes optimized custom formats:
- **Dual-language (DL)** (highest score) - Has both dubbed and original audio tracks
- **Original releases** - High-quality source material
- **Single-language dub** - Preferred for foreign content, fallback for native
- **Audio quality** - Progressive scoring for better codecs (Atmos, DTS-HD, DD+, etc.)
- **Unwanted** - Blocks low quality, obfuscated, or micro releases

These scoring preferences ensure you get the best available quality while preferring dubbed audio for foreign content.

## Troubleshooting

### Testing Before Making Changes

**Preview what will happen (dry-run mode):**
```bash
# Preview changes without actually modifying anything
docker exec langarr-tagger env DRY_RUN=true python3 /app/arr-language-tagger.py
```

This shows you:
- Which items will be tagged/untagged
- What profile changes will be made
- Language detection results
- No actual changes are made - safe to run anytime

### Common Issues

**Profiles not appearing in Radarr/Sonarr?**
```bash
# Check recyclarr logs for errors
docker logs recyclarr

# Manually trigger profile sync
docker exec recyclarr recyclarr sync

# Verify API keys and URLs are correct in .env
docker exec recyclarr env | grep -E "RADARR|SONARR"
```

**Items not being tagged?**
```bash
# Check language tagger logs
docker logs langarr-tagger

# Verify profiles exist (must match config exactly)
# Radarr/Sonarr → Settings → Profiles → Check for "Original Preferred" and "Dub Preferred"

# Test with dry-run (see above)
```

**Language detection not working?**
- Verify Sonarr is v4+ (v3 has limited language support)
- Check if the content has language metadata in Radarr/Sonarr
- Run dry-run to see what languages are detected

**Custom format score issues?**
- Check Radarr/Sonarr → Settings → Profiles → [Profile Name] → Custom Formats
- Verify custom format scores match your preferences
- TRaSH Guides formats may need manual adjustment in UI

**Container can't connect to Radarr/Sonarr?**
```bash
# Test network connectivity
docker exec langarr-tagger ping radarr
docker exec langarr-tagger ping sonarr

# Verify containers are on the same network
docker network inspect media-stack
```

## Architecture

```
langarr/
├── docker-compose.yml           # Orchestrates both services
├── .env                         # Your credentials (gitignored)
├── recyclarr/
│   └── recyclarr.yml           # Pre-configured dual profiles
└── language-tagger/
    ├── arr-language-tagger.py  # Auto-assignment script
    ├── config.yml              # Language preferences
    └── Dockerfile              # Container definition
```

## Adapting for Other Languages

The language tagger works with **any language** out of the box - just update the language codes in `config.yml`.

### Customizing Recyclarr for Your Language

Langarr ships with German custom formats as a reference implementation. TRaSH Guides provides pre-configured templates for many languages:

**Supported Languages:** French, Spanish, Italian, Portuguese, Japanese, Dutch, and more!

#### Option 1: Using TRaSH Guides Templates (Easiest)

**Step 1:** Find your language template:
- **French:** [Radarr](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/#french-audio-version) | [Sonarr](https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/#french-audio-version)
- **Spanish:** [Radarr](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/#spanish-audio-version) | [Sonarr](https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/#spanish-audio-version)
- **Italian:** [Radarr](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/#italian-audio-version) | [Sonarr](https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/#italian-audio-version)
- **Portuguese:** [Radarr](https://trash-guides.info/Radarr/Radarr-collection-of-custom-formats/#portuguese-brazilian-audio-version) | [Sonarr](https://trash-guides.info/Sonarr/sonarr-collection-of-custom-formats/#portuguese-brazilian-audio-version)
- **Full list:** [TRaSH Guides Custom Formats](https://trash-guides.info)

**Step 2:** Update `recyclarr/recyclarr.yml`:
```yaml
# In both Radarr and Sonarr sections, replace:
include:
  - template: radarr-custom-formats-hd-bluray-web-german  # OLD
# With your language:
  - template: radarr-custom-formats-hd-bluray-web-french  # NEW
```

**Step 3:** Replace language-specific custom format IDs:

Search `recyclarr/recyclarr.yml` for German-specific entries and replace with your language's IDs from TRaSH Guides:
- `German DL` → Your language's dual-language format
- `German Bluray Tier 01/02/03` → Your language's quality tiers
- `Not German or English` → `Not [YourLanguage] or English`

**Step 4:** Update `language-tagger/config.yml`:
```yaml
original_languages:
  - en  # English
  - fr  # Your native language (use 2-letter ISO code)
```

Done! Profile names (`Original Preferred`, `Dub Preferred`) and tags (`prefer-dub`) are already language-neutral.

#### Option 2: Manual Custom Formats

If TRaSH Guides doesn't have your language:
1. Create custom formats manually in Radarr/Sonarr → Settings → Custom Formats
2. Define scoring rules in your quality profiles
3. Keep the dual profile strategy (Original Preferred vs Dub Preferred)

**Tip:** Look at the German config in `recyclarr/recyclarr.yml` as a template for format structure and scoring

### Share Your Configuration

If you adapt Langarr for another language, please contribute your `recyclarr.yml` via PR to help the community!

## Credits

- Built on [Recyclarr](https://recyclarr.dev) for quality profile management
- Uses [TRaSH Guides](https://trash-guides.info) custom formats
- Language detection inspired by the multilingual media community

## License

MIT
