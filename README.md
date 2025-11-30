<div align="center">
  <img src="icon.png" alt="Langarr Logo" width="200"/>

  # Langarr
</div>

> **⚠️ AI-Generated Code** - Review before production use. Test with `DRY_RUN=true` first. Backup your databases.

**Automatic quality profile management for Radarr & Sonarr based on original language**

Perfect for multilingual libraries where you want original audio for some languages (English, German) but dubbed audio for foreign content (Korean, Japanese, French, etc.).

## Quick Start

**What you need:**
- Radarr v3+ and/or Sonarr v3+ (v4 recommended)
- Recyclarr already running in your docker-compose stack
- Docker & Docker Compose

**What it does:**
1. Creates two quality profiles: `Original Preferred` and `Dub Preferred`
2. Automatically assigns profiles based on original language
3. Tags foreign content with `prefer-dub` for easy filtering

## Installation

### 1. Add Langarr Service

**Using pre-built image (recommended):**

Choose your version:
- `latest` - Stable releases (recommended for production)
- `v1.0.0` - Specific version (pin for stability)
- `develop` - Development builds (testing/bleeding edge)

```yaml
services:
  langarr:
    image: ghcr.io/qudiqudi/langarr:latest  # or :v1.0.0 or :develop
    container_name: langarr
    ports:
      - "5678:5678"  # For webhook support
    environment:
      - RADARR_URL=${RADARR_URL}
      - RADARR_API_KEY=${RADARR_API_KEY}
      - SONARR_URL=${SONARR_URL}
      - SONARR_API_KEY=${SONARR_API_KEY}
      - OVERSEERR_URL=${OVERSEERR_URL}  # Optional
      - OVERSEERR_API_KEY=${OVERSEERR_API_KEY}  # Optional
    volumes:
      - ./langarr-config:/config:ro
    networks:
      - your_network_name
    restart: unless-stopped
```

**Building from source:**
```bash
git clone https://github.com/qudiqudi/langarr.git
cd langarr
```

Then use `build: ./langarr/language-tagger` instead of `image:` in docker-compose.

### 2. Add Recyclarr Profiles

**New to Recyclarr?** Copy the full example:
```bash
cp recyclarr/recyclarr-full-example.yml /path/to/recyclarr/config/recyclarr.yml
```

**Existing config?** See [`recyclarr/README.md`](recyclarr/README.md) to merge profiles.

**Sync profiles:**
```bash
docker exec recyclarr recyclarr sync
```

Verify in Radarr/Sonarr → Settings → Profiles

### 3. Configure Languages

Create `./langarr-config/config.yml`:
```yaml
radarr:
  main:
    enabled: true
    original_languages:
      - en  # English
      - de  # German
    original_profile: Original Preferred
    dub_profile: Dub Preferred

sonarr:
  main:
    enabled: true
    original_languages:
      - en
      - de
    original_profile: Original Preferred
    dub_profile: Dub Preferred

webhook:
  enabled: true
  port: 5678
  auth_token: "your-secure-random-token-here"  # REQUIRED for security
```

### 4. Start Service

```bash
docker-compose up -d langarr
docker logs -f langarr
```

## Configuration

### Environment Variables
```bash
# Required (usually already defined)
RADARR_URL=http://radarr:7878
RADARR_API_KEY=your-api-key
SONARR_URL=http://sonarr:8989
SONARR_API_KEY=your-api-key

# Optional: Testing
DRY_RUN=true  # Preview changes without applying
```

### Multiple Instances

For 4K/Anime instances, add to config:
```yaml
radarr:
  main:
    enabled: true
    # ...
  4k:  # Matches RADARR_4K_URL env var
    enabled: true
    original_languages:
      - en
```

## Overseerr/Seerr Integration (Optional)

Automatically set correct profiles on requests **before** they reach Radarr/Sonarr.

### Setup

**1. Add environment variables:**
```bash
OVERSEERR_URL=http://overseerr:5055
OVERSEERR_API_KEY=your-api-key
```

**2. Enable in `config.yml`:**
```yaml
overseerr:
  main:
    enabled: true
    radarr_servers:
      0: main  # Overseerr server ID 0 → langarr radarr.main
    sonarr_servers:
      0: main
```

**Finding Server IDs:**
- Settings → Services → click server → check URL
- Example: `/settings/services/radarr/0` → ID is `0`
- Note: Seerr uses 0-based IDs (starts at 0, not 1)

### Webhook Support (Recommended for Auto-Approve)

For instant profile updates with auto-approve enabled:

**1. Enable webhook in `config.yml`:**
```yaml
webhook:
  enabled: true
  port: 5678
  auth_token: "your-secure-random-token-here"  # REQUIRED for security
```

**2. Expose port in docker-compose:**
```yaml
services:
  langarr:
    ports:
      - "5678:5678"
```

**3. Configure in Seerr/Overseerr:**
- Settings → Notifications → Webhook
- URL: `http://langarr:5678/webhook`
- Authorization Header: `your-secure-random-token-here` (must match config.yml auth_token)
  - **Note:** Enter just the token value, not `X-Auth-Token:` or `Bearer`
  - The server accepts: `Authorization`, `Bearer <token>`, or `X-Auth-Token` formats
- Enable: **Media Auto Approved** + **Media Pending**

**How it works:**
```
User requests → Webhook fires → Langarr updates profile in Radarr
→ Triggers search → Downloads with correct quality ✅
```

**Without webhook:** Profiles updated every 24 hours (still works, just slower)

## How It Works

### Profile Assignment Logic
- **Original language matches config** (`en`, `de`) → `Original Preferred`
- **Foreign language** (`ko`, `ja`, `fr`) → `Dub Preferred` + `prefer-dub` tag

### Workflow
1. **Recyclarr** syncs quality profiles with custom formats
2. **Langarr** assigns profiles based on original language
3. **Runs every 24 hours** to tag new content
4. **(Optional) Webhook** for instant updates on new requests

## Troubleshooting

### Test with Dry-Run
```bash
docker exec langarr env DRY_RUN=true RUN_MODE=once python3 /app/arr-language-tagger.py
```

### Common Issues

**Profiles not appearing?**
```bash
docker exec recyclarr recyclarr sync
# Check Radarr/Sonarr → Settings → Profiles
```

**Items not being tagged?**
```bash
docker logs langarr
# Verify profile names match exactly
```

**Webhook not working?**
```bash
docker logs -f langarr
# Check for "Received webhook" messages
# Verify port 5678 is exposed
```

**Language detection issues?**
- Sonarr v4+ required for full language support
- Check if content has language metadata in Radarr/Sonarr

## Adapting for Other Languages

### Using TRaSH Guides Templates

1. **Find your language:** [TRaSH Guides](https://trash-guides.info)
   - French, Spanish, Italian, Portuguese, Japanese, etc.

2. **Update recyclarr template:**
```yaml
include:
  - template: radarr-custom-formats-hd-bluray-web-french  # Replace 'german'
```

3. **Replace custom format IDs:** Follow language-specific IDs from TRaSH Guides

4. **Update language codes:**
```yaml
original_languages:
  - en
  - fr  # Your language
```

**Share your config!** Submit a PR to help others.

## Versioning

Langarr follows [Semantic Versioning](https://semver.org/):

- **Production:** Use `latest` tag or pin to specific version `v1.0.0`
- **Testing:** Use `develop` tag for bleeding-edge features
- **Releases:** Tagged as `v1.0.0`, `v1.1.0`, etc.

**Docker image tags:**
```yaml
ghcr.io/qudiqudi/langarr:latest   # Latest stable release
ghcr.io/qudiqudi/langarr:v1.0.0   # Specific version
ghcr.io/qudiqudi/langarr:develop  # Development builds
```

## Credits

- [Recyclarr](https://recyclarr.dev) - Quality profile management
- [TRaSH Guides](https://trash-guides.info) - Custom formats
- Built with AI assistance (Claude Code)

## License

MIT
