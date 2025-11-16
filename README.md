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
   - `Original Preferred` - For content in your native languages (keeps original audio)
   - `Dub Preferred` - For foreign content (prefers dub in your language, accepts original as fallback)

2. **Language Tagger** automatically assigns the correct profile:
   - Shows in your configured languages → `Original Preferred`
   - Foreign language shows → `Dub Preferred` + tagged `prefer-dub`
   - The `prefer-dub` tag helps you filter and identify foreign content in your library

3. Runs automatically every 24 hours to tag new content

## Prerequisites

Before installing Langarr, you need:

- **Radarr** v3+ (v4+ recommended) and/or **Sonarr** v3+ (v4 required for full language support)
- **Docker** & **Docker Compose** installed
- **Docker network** connecting your media services:
  ```bash
  # List your existing networks
  docker network ls

  # If you don't have one, create it
  docker network create media-stack

  # Connect your existing Radarr/Sonarr to the network
  docker network connect media-stack radarr
  docker network connect media-stack sonarr
  ```
- **API Keys** from Radarr/Sonarr (Settings → General → Security → API Key)

## Quick Start

```bash
# Clone repository
git clone https://github.com/qudiqudi/langarr.git
cd langarr

# Configure environment
cp .env.example .env
nano .env  # Edit with your settings (see below)

# Start services
docker-compose up -d

# Monitor initial setup (wait 2-3 minutes for recyclarr to create profiles)
docker logs -f recyclarr

# Once recyclarr finishes, check language tagger
docker logs -f langarr-tagger
```

### What Happens Next?

1. **Recyclarr runs** (~1-2 minutes): Creates two new quality profiles in your Radarr/Sonarr
   - Check Radarr/Sonarr → Settings → Profiles - you should see "Original Preferred" and "Dub Preferred"

2. **Language Tagger runs** (~5-30 seconds depending on library size):
   - Analyzes each movie/show's original language
   - Assigns appropriate profile
   - Adds `prefer-dub` tag to foreign content

3. **Verify it worked:**
   - Check Radarr/Sonarr UI for the new tag `prefer-dub`
   - Foreign language content should have "Dub Preferred" profile
   - Native language content should have "Original Preferred" profile

4. **Auto-updates:** Runs every 24 hours to process new additions

## Configuration

### Required Settings (.env)

```bash
# Timezone (for logs and scheduling)
TZ=Europe/Berlin

# User/Group IDs - Must match your Radarr/Sonarr container user
# Find with: docker exec radarr id
# Most systems: PUID=1000, PGID=1000
PUID=1000
PGID=1000

# Radarr Configuration
RADARR_URL=http://radarr:7878            # Use container name if on same docker network
RADARR_API_KEY=your_key_here             # Settings → General → Security → API Key

# Sonarr Configuration
SONARR_URL=http://sonarr:8989            # Use container name if on same docker network
SONARR_API_KEY=your_key_here             # Settings → General → Security → API Key

# Docker Network - Must exist and contain Radarr/Sonarr (see Prerequisites)
DOCKER_NETWORK=media-stack
```

**Note:** If your Radarr/Sonarr use different ports or are on different hosts, adjust the URLs accordingly:
- External host: `http://192.168.1.100:7878`
- Custom port: `http://radarr:7879`

### Customize Languages (language-tagger/config.yml)

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
