# Cloudflare Migration Preparation

## Phase 1 scope and safety

Phase 1 only establishes a migration scaffold. It does not deploy, alter DNS,
connect to Cloudflare, run database migrations, or change Manus OAuth, Forge
Storage, heartbeat, or scheduled-task behavior. The current Node/Express entry
remains `server/_core/index.ts`.

The Phase 1 Worker is intentionally fail-closed for `/api/*` and
`/manus-storage/*`. It serves built static assets but never proxies dynamic
requests to the existing production service or database.

## Current structure

- React/Vite frontend built to `dist/public`
- Express/tRPC Node server at `server/_core/index.ts`
- MySQL/TiDB through `DATABASE_URL`, Drizzle ORM, and `mysql2`
- Manus OAuth and JWT sessions under `server/_core`
- Existing Forge Storage proxy/upload handling
- Heartbeat and scheduled backup, publish, and cleanup modules

## Target structure

- Cloudflare Worker request entry at `cloudflare/worker.ts`
- Workers Static Assets serving `dist/public`
- A future request/auth adapter independent of Express
- Hyperdrive connecting to the existing MySQL/TiDB database
- R2 replacing storage only after a separate compatibility and data migration phase
- Workers Cron Triggers calling extracted scheduled business functions

The existing MySQL/TiDB schema remains the source of truth. D1 and schema changes
are outside Phase 1.

## Required Cloudflare services

| Service | Intended use | Phase 1 state |
| --- | --- | --- |
| Workers | Dynamic request adapter | Entry shell only |
| Workers Static Assets | Vite frontend | Binding configured |
| Hyperdrive | Existing MySQL/TiDB connection | Placeholder only |
| R2 | Future object storage | Placeholder only |
| Workers Secrets | Server-only credentials | Documented, not created |
| Cron Triggers | Scheduled jobs | Deferred |
| Custom Domains/DNS | Production routing | Explicitly deferred |

## Environment variables and bindings

Existing values are grouped in `.env.example` under Database, Authentication,
Storage/Manus APIs, AI/external APIs, Analytics, and Application. No real secret
belongs in that file.

Cloudflare bindings declared in `wrangler.jsonc` are:

- `ASSETS`: built frontend assets
- `HYPERDRIVE`: future existing-database connection
- `R2_BUCKET`: future object storage
- `APP_ENV`: non-secret environment label

Store `JWT_SECRET`, Forge API keys, OAuth client secrets, AI keys, and service
account JSON as Workers secrets. Use the ignored `.dev.vars` for local Wrangler
development. Never use a `VITE_` variable for a secret because Vite exposes it
to browsers.

## Manual Dashboard work for a future phase

1. Create separate preview and production Workers environments.
2. Create preview-only Hyperdrive credentials with minimum access.
3. Create separate preview and production R2 buckets and configure retention/CORS.
4. Add server-only values through Workers Secrets.
5. Configure OAuth callback URLs for a preview hostname.
6. Add Cron Triggers only after jobs are Worker-compatible and idempotent.
7. Validate preview before enabling any custom domain or DNS route.

None of these Dashboard actions is performed in Phase 1.

## Candidate files for Phase 2

- `cloudflare/worker.ts`: implement routing and request context incrementally
- `server/db.ts`: extract a binding-aware connection factory
- `server/_core/oauth.ts`, `server/_core/context.ts`, `server/_core/cookies.ts`:
  isolate authentication from Express and Manus-specific transport
- `server/storage.ts`, `server/_core/storageProxy.ts`, `server/upload.ts`: introduce
  a storage interface and R2 implementation while preserving URL compatibility
- `server/scheduled-backup.ts`, `server/scheduled-publish.ts`, and
  `server/scheduled-trash-cleanup.ts`: extract business functions for Cron
- `server/_core/heartbeat.ts`: replace only after scheduled behavior is verified

Before Phase 2 deployment, restore a reproducible dependency install, run the
existing checks/tests/build, validate Wrangler, and use preview-only resources.
Do not run `pnpm db:push` as part of migration preparation.
