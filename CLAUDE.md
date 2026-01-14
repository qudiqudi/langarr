# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Langarr is an automatic quality profile management service for Radarr & Sonarr that assigns profiles based on content's original language. Users configure instances via a WebUI, set language-to-profile mappings, and Langarr assigns `Original Preferred` or `Dub Preferred` profiles accordingly. Optional features include Overseerr webhook integration and audio track tagging.

## Tech Stack

- **Backend**: Node.js + Express.js + TypeScript
- **Frontend**: Next.js 14 + React 18 + TailwindCSS
- **Database**: SQLite via TypeORM + better-sqlite3

## Development Commands

All commands run from `webui/` directory:

```bash
npm run dev          # Full dev mode (backend + frontend with hot reload)
npm run dev:server   # Backend only
npm run dev:next     # Frontend only
npm run build        # Production build
npm run lint         # ESLint
npm run type-check   # TypeScript check (no emit)
```

Pre-commit hooks (Husky + lint-staged) run `type-check` and `lint` on staged `.ts/.tsx` files.

### Docker

```bash
docker build -t langarr:local ./webui
docker compose up -d langarr
```

## Branch Strategy

- `main` - Production (protected, requires PR)
- `develop` - Integration branch
- `feature/*` - Feature branches (merge to develop)

## Architecture

```
webui/
├── server/           # Express.js backend
│   ├── entity/       # TypeORM entities (RadarrInstance, SonarrInstance, Settings, etc.)
│   ├── routes/       # API endpoints (radarr, sonarr, overseerr, auth, actions, status)
│   ├── services/     # Business logic (SyncService, Scheduler)
│   ├── lib/          # Utilities (arrClient, audioTagProcessor, profileCache)
│   └── middleware/   # Auth middleware
├── src/              # Next.js frontend
│   ├── pages/        # Pages (dashboard, settings, login, setup)
│   ├── components/   # React components
│   ├── hooks/        # Data fetching hooks (SWR-based)
│   └── context/      # Auth context
└── Dockerfile
```

### Key Files

- `server/services/SyncService.ts` - Core sync logic; `processRadarr()` and `processSonarr()` are main entry points
- `server/services/Scheduler.ts` - Cron-like scheduling for periodic syncs
- `server/lib/arrClient.ts` - HTTP client for Radarr/Sonarr APIs
- `server/lib/audioTagProcessor.ts` - Parses audio languages from mediaInfo, applies tag rules
- `server/datasource.ts` - TypeORM SQLite configuration

### Path Aliases

- `@/*` → `src/*` (frontend)
- `@server/*` → `server/*` (backend)

### API Routes

All routes under `/api/v1/`. Standard REST patterns for `/radarr`, `/sonarr`, `/overseerr`, `/settings`, `/auth`. Action endpoints: `POST /actions/sync`, `POST /actions/audio-scan`. External webhook: `POST /webhook`.

## Core Logic

### Profile Assignment (SyncService)

1. Fetch content from Radarr/Sonarr
2. For each item: check original language from TMDB metadata
3. If language in `originalLanguages` → assign `originalProfile`, else → `dubProfile` + `prefer-dub` tag
4. Optionally trigger automatic search

SyncService uses `CONCURRENCY_LIMIT = 3` to prevent overwhelming Radarr/Sonarr.

### Audio Tagging (audioTagProcessor)

Analyzes downloaded files to tag based on actual audio tracks:
- Primary source: `mediaInfo.audioLanguages`
- Fallback: `languages` field (parsed from release name)
- Sonarr: only tags series if ALL episodes have the audio track

### Webhook Flow

Overseerr request → `POST /api/v1/webhook` → SyncService updates profile immediately → triggers search

## Notes

- Database: `/config/langarr.db` (SQLite)
- First-run redirects to `/setup` wizard
- Server logs: `server.log` (gitignored)
- TypeORM auto-syncs schema on startup
- Docker tags: `latest` (stable), `develop` (dev builds), `v2.x.x` (pinned)
