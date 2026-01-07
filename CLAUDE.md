# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Langarr** is an automatic quality profile management service for Radarr & Sonarr that assigns profiles based on content's original language. It features a modern web-based UI for configuration and management.

**Core Workflow:**
1. Configure Radarr/Sonarr instances via the WebUI
2. Set original languages and profile mappings
3. Langarr automatically assigns profiles (`Original Preferred` or `Dub Preferred`) based on original language
4. Optional: Webhook support for instant updates on new Overseerr/Seerr requests
5. Optional: Audio track tagging based on actual downloaded file content

## Technology Stack

- **Backend**: Node.js + Express.js + TypeScript
- **Frontend**: Next.js 14 + React 18 + TailwindCSS
- **Database**: SQLite via TypeORM + better-sqlite3
- **Authentication**: bcrypt + express-session

## Development Workflow

### Branch Strategy
- **main** - Stable production releases (protected, requires PR)
- **develop** - Integration/testing branch
- **feature/** - Feature development branches (merge to develop)

### Docker Build & Run
```bash
# Build Docker image locally
docker build -t langarr:local ./webui

# Run with docker compose
docker compose up -d langarr
docker logs -f langarr

# Development mode (hot reload)
cd webui
npm install
npm run dev
```

## Architecture

### Directory Structure

```
webui/
├── server/           # Express.js backend
│   ├── entity/       # TypeORM entities
│   ├── routes/       # API endpoints
│   ├── services/     # Business logic
│   ├── lib/          # Utilities (arrClient, etc.)
│   └── middleware/   # Auth middleware
├── src/              # Next.js frontend
│   ├── pages/        # Page components & API routes
│   ├── components/   # React components
│   ├── hooks/        # Custom React hooks
│   └── context/      # React context providers
└── Dockerfile        # Production container
```

### Core Components

**Backend (`server/`)**

| File | Purpose |
|------|---------|
| `index.ts` | Express server, mounts routes, starts scheduler |
| `datasource.ts` | TypeORM SQLite configuration |
| `services/SyncService.ts` | Core sync logic - processes Radarr/Sonarr libraries |
| `services/Scheduler.ts` | Cron-like job scheduling for periodic syncs |
| `routes/radarr.ts` | CRUD for Radarr instances |
| `routes/sonarr.ts` | CRUD for Sonarr instances |
| `routes/overseerr.ts` | Overseerr integration + webhook config |
| `routes/status.ts` | Dashboard data - instance health, last sync |
| `routes/actions.ts` | Manual sync triggers |
| `routes/auth.ts` | Login/logout, session management |

**Entities (`server/entity/`)**

| Entity | Purpose |
|--------|---------|
| `RadarrInstance` | Radarr server config (URL, API key, profiles, languages) |
| `SonarrInstance` | Sonarr server config |
| `OverseerrInstance` | Overseerr config + server ID mappings |
| `Settings` | Global settings (webhook, sync intervals) |
| `User` | Admin user authentication |
| `SyncLog` | Sync history and results |
| `Session` | Express session storage |

**Frontend (`src/`)**

| Directory | Purpose |
|-----------|---------|
| `pages/` | Next.js pages (dashboard, settings, login, setup) |
| `components/` | Reusable UI components (Layout, InstanceCard, etc.) |
| `hooks/` | Data fetching hooks (useStatus, useInstances) |
| `context/` | Auth context provider |

### API Routes

All API routes are under `/api/v1/`:

```
POST   /auth/login
POST   /auth/logout
GET    /auth/session

GET    /radarr
POST   /radarr
PUT    /radarr/:id
DELETE /radarr/:id
POST   /radarr/:id/test

GET    /sonarr
POST   /sonarr
PUT    /sonarr/:id
DELETE /sonarr/:id
POST   /sonarr/:id/test

GET    /overseerr
POST   /overseerr
PUT    /overseerr/:id
DELETE /overseerr/:id

GET    /settings
PUT    /settings

GET    /status
GET    /logs
POST   /actions/sync
POST   /actions/audio-scan

POST   /webhook  (external - for Overseerr webhooks)
```

### Configuration

Configuration is stored in SQLite database at `/config/langarr.db`:
- All instance settings, API keys, profiles
- User credentials (bcrypt hashed)
- Sync logs and history

**First-run setup:**
1. Navigate to `http://localhost:3000`
2. Redirects to `/setup` wizard
3. Create admin user
4. Configure first Radarr/Sonarr instance
5. Dashboard becomes accessible

### Profile Assignment Logic

The core logic in `SyncService.ts`:

1. Fetch all content from Radarr/Sonarr
2. For each item:
   - Get original language from TMDB metadata
   - If original language in `originalLanguages` → assign `originalProfile`
   - Otherwise → assign `dubProfile` + add `prefer-dub` tag
3. Optionally trigger automatic search after profile update

### Webhook Flow (Overseerr Integration)

```
User requests content in Overseerr
→ Webhook fires to /api/v1/webhook
→ SyncService updates profile in Radarr/Sonarr immediately
→ Triggers search
→ Downloads with correct quality profile
```

## Important Notes

### Testing
- First-time setup redirects to `/setup` wizard
- Use browser dev tools to inspect API calls
- Check `server.log` for backend errors (gitignored)

### Database Location
SQLite database stored at `/config/langarr.db` (mounted volume in Docker)

### Docker Image Tags

| Tag | Purpose |
|-----|---------|
| `latest` | Stable production release |
| `v2.x.x` | Specific version (pinned) |
| `develop` | Development builds with debug features |

The image tag determines runtime behavior - no need to set `NODE_ENV` manually.

### Environment Variables

Optional configuration via environment:
- `PORT` - Server port (default: 3000)
- `TZ` - Timezone (default: Etc/UTC)

### Common Development Tasks

**Adding a new API route:**
1. Create route file in `server/routes/`
2. Mount in `server/index.ts`
3. Add frontend hook in `src/hooks/` if needed

**Adding a new entity:**
1. Create entity in `server/entity/`
2. Add to `datasource.ts` entities array
3. Run app - TypeORM auto-syncs schema

**Modifying sync logic:**
- Core logic in `server/services/SyncService.ts`
- `processRadarr()` / `processSonarr()` are main entry points
