# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + TanStack Query + Tailwind CSS

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### Apartment Watchlist (`artifacts/apartment-watchlist`)
- **Kind**: web (React + Vite)
- **Preview path**: `/`
- **Purpose**: Personal apartment listing tracker — paste Centris/Realtor.ca URLs, monitor for price drops and status changes

### API Server (`artifacts/api-server`)
- **Kind**: api (Express 5)
- **Purpose**: Backend for the Apartment Watchlist

## Database Schema (`lib/db/src/schema/index.ts`)

Tables:
- `listings` — core listing data (URL, price, status, interest level, notes, etc.)
- `listing_snapshots` — full snapshots at each check
- `listing_changes` — field-level diffs (price drops, status changes, etc.)
- `notifications` — in-app alerts for detected changes
- `settings` — key/value app settings (check interval, Browse AI key, etc.)

## Backend Services (`artifacts/api-server/src/services/`)

- `scraper.ts` — fetches listing pages via native fetch + Browse AI fallback
- `browseAI.ts` — Browse AI API polling + webhook parsing
- `diffEngine.ts` — field-by-field diff with change categorization
- `checker.ts` — re-check logic + notification creation
- `scheduler.ts` — interval-based periodic checker (starts at server boot)
- `settingsService.ts` — DB-backed key/value settings

## Backend Parsers (`artifacts/api-server/src/parsers/`)

- `centris.ts` — Centris-specific HTML parser (uses Cheerio)
- `realtor.ts` — Realtor.ca parser with JSON-LD extraction
- `shared.ts` — shared utilities
- `index.ts` — URL dispatcher (routes to correct parser)

## API Routes (`artifacts/api-server/src/routes/`)

- `listings.ts` — CRUD + `/check` + `/changes` + `/snapshots` (POST /check-all registered before /:id)
- `notifications.ts` — list + mark-read
- `settings.ts` — get/put settings (also restarts scheduler)
- `browseai.ts` — Browse AI webhook receiver
- `dashboard.ts` — summary stats

## Frontend Pages (`artifacts/apartment-watchlist/src/`)

- `App.tsx` — routing, layout, watchlist table with filters/search
- Listing detail panel — price history, change log, notes
- Add Listing modal — paste URL to add
- Settings page — check interval, Browse AI key, notifications
- Notification panel — bell icon with unread badge

## Out of Scope (Deferred)

- CSV export (explicitly deferred by user)
