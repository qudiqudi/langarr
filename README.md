# Langarr

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

3. Runs automatically every 24 hours to tag new content

## Quick Start

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/langarr.git
cd langarr

# Configure
cp .env.example .env
nano .env  # Add your Radarr/Sonarr URLs and API keys

# Start
docker-compose up -d

# Check logs
docker logs -f langarr-tagger
docker logs -f recyclarr
```

## Configuration

### Required Settings (.env)

```bash
TZ=Europe/Berlin                          # Your timezone
RADARR_URL=http://radarr:7878            # Radarr URL
RADARR_API_KEY=your_key                   # Get from Radarr → Settings → General → Security
SONARR_URL=http://sonarr:8989            # Sonarr URL
SONARR_API_KEY=your_key                   # Get from Sonarr → Settings → General → Security
DOCKER_NETWORK=media-stack                # Your docker network name
```

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

The script uses automatic format detection - just use standard 2-letter ISO 639-1 codes.

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

## Requirements

- Radarr v3+ (v4+ recommended)
- Sonarr v3+ (v4 required for full language support)
- Docker & Docker Compose
- Existing quality profiles will NOT be modified (creates new ones)

## Troubleshooting

**Profiles not appearing?**
```bash
# Check recyclarr logs
docker logs recyclarr

# Manually trigger sync
docker exec recyclarr recyclarr sync
```

**Items not being tagged?**
```bash
# Check language tagger logs
docker logs langarr-tagger

# Run dry-run to preview
docker exec langarr-tagger env DRY_RUN=true python3 /app/arr-language-tagger.py
```

**Custom format score issues?**
Check Radarr/Sonarr → Settings → Profiles → [Profile Name] → Custom Format scores match your preferences.

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

## Using Other Languages

The language tagger works with **any language** out of the box - just update the language codes in `config.yml`.

### Adapting the Recyclarr Configuration

Langarr ships with German custom formats as a reference implementation. TRaSH Guides provides pre-configured templates for many languages, making adaptation straightforward:

**Supported Languages:** French, Spanish, Italian, Portuguese, Japanese, and more!

**Quick Setup (3 steps):**

1. **Find your language template** at https://trash-guides.info:
   - French: `sonarr-v4-custom-formats-hd-bluray-web-french`
   - Spanish: `sonarr-v4-custom-formats-hd-bluray-web-spanish`
   - Italian: `sonarr-v4-custom-formats-hd-bluray-web-italian`
   - Portuguese: `sonarr-v4-custom-formats-hd-bluray-web-portuguese`
   - And more...

2. **Update `recyclarr/recyclarr.yml`** (2 places - Radarr & Sonarr sections):
   ```yaml
   include:
     - template: sonarr-v4-custom-formats-hd-bluray-web-french  # Your language
   ```

3. **Replace custom format trash_ids**:
   - Search the config for language-specific formats (e.g., "German DL", "German Bluray Tier")
   - Replace with your language's IDs from TRaSH Guides
   - Update the blocker: "Not German or English" → "Not [YourLanguage] or English"

**Bonus:** Update `language-tagger/config.yml` to match your preferences:
```yaml
original_languages:
  - en  # English
  - fr  # French (or your native language)
```

That's it! Profile names and tags are already language-neutral, so no other changes needed.

**Need help?** If TRaSH Guides doesn't have your language yet, you can create custom formats manually in Radarr/Sonarr settings.

**Share your setup!** If you adapt this for another language, please submit example configs via PR to help the community.

## Credits

- Built on [Recyclarr](https://recyclarr.dev) for quality profile management
- Uses [TRaSH Guides](https://trash-guides.info) custom formats
- Language detection inspired by the multilingual media community

## License

MIT
