# Recyclarr Integration Guide

Langarr requires TWO quality profiles in your Radarr/Sonarr:
- **Original Preferred** - Prefers original audio track (scores dub-only releases lower)
- **Dub Preferred** - Prefers dubbed audio (scores dub-only releases higher)

The Language Tagger then assigns these profiles based on content's original language:
- English/German content → Original Preferred (you understand it, keep original audio)
- French/Japanese/etc → Dub Preferred (you need a dub to understand it)

## Integration Options

### Option 1: Use the Full Example (Fresh Setup)

If you're setting up recyclarr from scratch or want to replace your config entirely:

```bash
cp recyclarr-full-example.yml /path/to/your/recyclarr/config/recyclarr.yml
```

### Option 2: Add Profiles to Existing Config (Recommended)

If you already have a recyclarr config with custom formats, add these profiles to your existing configuration.

#### Step 1: Add the Quality Profiles

Add these to your existing `radarr:` section under `quality_profiles:`:

```yaml
    quality_profiles:
      # ADD THESE TWO PROFILES (keep your existing profiles)

      - name: Original Preferred
        reset_unmatched_scores:
          enabled: true
        score_set: german  # Or your language score_set
        upgrade:
          allowed: true
          until_quality: Merged QPs  # Adjust to match your quality group name
          until_score: 50000
        min_format_score: 0
        quality_sort: top
        qualities:
          - name: Merged QPs  # Adjust to match your quality group name
            qualities:
              - Bluray-1080p
              - WEBRip-1080p
              - WEBDL-1080p
              - Bluray-720p
              - WEBDL-720p
              - WEBRip-720p

      - name: Dub Preferred
        reset_unmatched_scores:
          enabled: true
        score_set: german
        upgrade:
          allowed: true
          until_quality: Merged QPs
          until_score: 50000
        min_format_score: 0
        quality_sort: top
        qualities:
          - name: Merged QPs
            qualities:
              - Bluray-1080p
              - WEBRip-1080p
              - WEBDL-1080p
              - Bluray-720p
              - WEBDL-720p
              - WEBRip-720p
```

#### Step 2: Add Language-Specific Scoring

The KEY difference between profiles is how they score language-only releases.

Find your existing German language custom format and update it to assign different scores per profile:

```yaml
    custom_formats:
      # GERMAN ONLY - THE KEY DIFFERENTIATOR
      # Find your existing German CF and add both profile assignments:
      - trash_ids:
          - 86bc3115eb4e9873ac96904a4a68e19e  # German (Radarr)
          # OR for Sonarr: 8a9fcdbb445f2add0505926df3bb7b8a
        assign_scores_to:
          - name: Original Preferred
            score: 3000   # LOW - German-only loses original track
          - name: Dub Preferred
            score: 11000  # HIGH - Preferred for foreign content
```

#### Step 3: (Optional) Block Non-German/English Audio

Add this to block foreign audio on native content while allowing fallback on foreign content:

```yaml
      - trash_ids:
          - 4eadb75fb23d09dfc0a8e3f687e72287  # Not German or English (Radarr)
          # OR for Sonarr: 133589380b89f8f8394320901529bac1
        assign_scores_to:
          - name: Original Preferred
            score: -50000  # Block foreign audio on EN/DE content
          - name: Dub Preferred
            score: 0       # Allow original as fallback
```

## After Making Changes

Sync recyclarr to apply the new profiles:

```bash
docker exec recyclarr recyclarr sync
```

Then verify in Radarr/Sonarr:
- Go to **Settings → Profiles**
- You should see both `Original Preferred` and `Dub Preferred`

## Files in This Directory

- `README.md` - This migration guide
- `recyclarr-full-example.yml` - Complete example config (German/1080p focused)
