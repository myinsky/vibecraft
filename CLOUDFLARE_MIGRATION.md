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

## Phase 2: Forge-to-R2 storage adapter

`server/storage.ts` remains the public storage API used by existing callers. It
selects a provider using `STORAGE_PROVIDER`:

- `forge` (default): retains the Forge presign and S3 upload/download behavior.
- `r2`: uses the `R2_BUCKET` Worker binding directly.

The adapter exposes upload, provider-neutral fetch, download URL, delete, and
existence operations. R2 download URLs remain `/manus-storage/{key}` because an
R2 binding does not create S3-style presigned URLs. The storage proxy reads the
object through the selected provider and preserves the existing public URL shape.

### R2 preview migration procedure

1. Create a preview-only R2 bucket; do not reuse a production Forge/S3 target.
2. Replace only the placeholder bucket names in the preview Wrangler config.
3. Keep `STORAGE_PROVIDER=forge` while copying objects and validating key parity.
4. Copy objects with a separate, audited migration tool and compare object count,
   key, byte size, content type, and checksums. This repository does not run that
   copy automatically.
5. Test uploads, inline images, attachments, backups, downloads, deletes, and
   missing-object responses using preview data.
6. Set `STORAGE_PROVIDER=r2` only for the preview Worker and verify rollback by
   switching it back to `forge`.

Forge and R2 are selected per runtime; Phase 2 does not dual-write or automatically
fall back between providers. Existing objects must be copied before switching.
R2 custom domains, public buckets, signed URLs, cache policy, lifecycle rules,
CORS, large-object/multipart strategy, and production cutover remain unresolved.
The current `sharp`, `multer`, `adm-zip`, Express streaming, and other Node-only
paths are intentionally not converted to Worker-native implementations here.

## Phase 3: Node compatibility inventory

| Dependency/API | Class | Current treatment |
| --- | --- | --- |
| Fetch, Request, Response, FormData, Blob, URL, Web Streams | A | Worker-native Web APIs |
| Web Crypto (`crypto.randomUUID`, `crypto.subtle`) | A | Prefer for shared code |
| Buffer and common Node crypto/path helpers | B | Available through `nodejs_compat`; reduce in shared paths |
| Node readable streams | B | Isolated behind the Express/Web Stream bridge |
| Outgoing Node http/https client APIs | B | Often compatible, but `fetch` is preferred |
| `sharp` | C | Native image processing; isolated behind `ImageTransformer` |
| `multer` | C | Express middleware; Worker parser uses `Request.formData()` |
| `adm-zip` ZIP routes | C | Node implementation isolated behind `ZipArchive` |
| `fs`, Vite middleware, and local filesystem serving | C | Must remain in the Node development/runtime entry |
| `http.createServer` and Express server lifecycle | C | Worker entry uses `fetch()` instead |
| Incoming Node proxy streams and Agents | C | Replace per route with fetch/Web Streams |
| `child_process` | C | No current application usage found |
| Direct `process.env` access | C | Centralized in `runtime-env.ts` with Worker binding fallback |

Class A is directly usable in Workers. Class B requires `nodejs_compat` and may
still be a migration target. Class C must be replaced, isolated to the Node
entry, or implemented by an external Cloudflare service.

### Phase 3 adapters

- `runtime-env.ts` reads injected Worker Env bindings first, then Node
  `process.env`. The Worker injects its bindings at the request boundary.
- `multipart-adapter.ts` parses Worker uploads with `Request.formData()` while
  existing Express routes continue using multer and its current size filters.
- `image-transform.ts` defines the replaceable image transformation interface;
  the default Node implementation continues using sharp.
- `zip-adapter.ts` defines the archive boundary and lazily loads the Node-only
  `zip-node.ts` implementation using adm-zip.
- `web-streams.ts` contains the only Web-to-Node stream bridge used by Express.
  Worker storage downloads return Web `Response` objects directly.

The Worker multipart parser is not connected to the existing upload endpoints
because `/api/*` is still fail-closed. Route validation, authentication, limits,
and error parity must be designed before enabling those endpoints.

Cloudflare Images or another image processing service is still required for a
fully Worker-native replacement of sharp. A future implementation can supply an
`ImageTransformer` without changing storage or upload business interfaces.

## Phase 4: MySQL/TiDB through Hyperdrive

The schema, Drizzle schema files, migration history, and database contents remain
unchanged. `drizzle.config.ts` continues to use `DATABASE_URL` only for explicit
Node-side Drizzle Kit commands; no Drizzle Kit command is run by the Worker.

### Provider model

- `DATABASE_PROVIDER=node` is the default for the current Manus/Node runtime.
  `server/db.ts` retains its lazy mysql2 pool and existing `getDb()` call surface.
  It continues to use `DATABASE_URL`, `connectionLimit`, queue/wait settings, and
  TCP keep-alive behavior.
- `DATABASE_PROVIDER=hyperdrive` is for Workers. `database-adapter.ts` creates a
  request-scoped `mysql2/promise` connection from the `HYPERDRIVE` binding fields
  (`host`, `port`, `user`, `password`, and `database`) with `disableEval: true`.
  Hyperdrive manages the underlying connection pool, so the Worker closes its
  logical mysql2 connection after each request instead of creating a global pool.

The installed mysql2 version satisfies Cloudflare's minimum version requirement.
`createRequestDatabase()` wraps either connection in the existing
`drizzle-orm/mysql2` adapter and returns a `close()` function. Worker business
routes must call `close()` in `finally`; they are not enabled during this phase.

### Private database health check

`GET /api/internal/db-health` executes only `SELECT 1`. It never reads a table or
returns rows, credentials, hostnames, connection strings, or error details.

The route requires `Authorization: Bearer <DB_HEALTH_TOKEN>`. `DB_HEALTH_TOKEN`
must be configured as a Worker secret. When the secret is absent or the header is
wrong, the route returns 404 to avoid advertising the endpoint. An authorized
request returns only `ok` or `unavailable`, the selected provider, and HTTP 200 or
503 with `Cache-Control: no-store`.

### Dashboard work deferred

1. Create a least-privilege preview database credential. A read-only credential
   is preferred for the initial health check and query rehearsal.
2. Create the Hyperdrive configuration against the existing MySQL/TiDB endpoint.
3. Replace `REPLACE_WITH_PREVIEW_HYPERDRIVE_ID` only in the preview configuration.
4. Add `DB_HEALTH_TOKEN` through Workers Secrets.
5. Confirm the database's supported TLS mode and authentication plugin.
6. Validate request-scoped Drizzle queries and connection cleanup using preview
   traffic before enabling any application DB route.

No `localConnectionString` is committed because it contains database credentials.
For local testing, use the ignored Cloudflare Hyperdrive local connection-string
environment variable or another non-versioned secret mechanism.

Unresolved items include TiDB-specific Hyperdrive compatibility, TLS/auth plugin
validation, transaction and prepared-statement behavior, query-cache policy,
connection/concurrency limits, request cancellation, and full application route
lifecycle tests. No migration, schema mutation, table operation, or data copy was
performed in Phase 4.

## Phase 5: Preview minimum runtime

The preview Worker exposes two diagnostic routes:

- `GET /api/health` returns `{ "status": "ok" }` with HTTP 200 and does not
  initialize or query the database.
- `GET /api/internal/db-health` remains hidden behind the `DB_HEALTH_TOKEN`
  bearer secret. It creates a request-scoped Hyperdrive/mysql2 connection, wraps
  it with the existing Drizzle MySQL adapter, executes only `SELECT 1`, and closes
  the logical connection in `finally`. Responses contain no database metadata or
  error details.

All other `/api/*` routes remain fail-closed with HTTP 501. They are handled by
the Worker first and never fall through to Static Assets. `/manus-storage/*`
continues to use the Phase 2 R2 adapter; no object copy is performed here.

Static files are served from `dist/public` using the `ASSETS` binding.
`not_found_handling: single-page-application` provides `index.html` fallback for
client routes such as `/article/...` and `/admin/...`. The Worker runs first only
for `/api/*` and `/manus-storage/*`, keeping API failures out of the SPA fallback.

### Preview deployment checklist (manual; not executed in this phase)

- [ ] Create a preview-only Cloudflare Worker.
- [ ] Create a Hyperdrive configuration for the existing MySQL/TiDB database.
- [ ] Create a least-privilege preview database credential.
- [ ] Create a preview-only R2 bucket.
- [ ] Replace the preview Hyperdrive and R2 placeholders outside committed secrets.
- [ ] Register `DB_HEALTH_TOKEN` as a Worker secret.
- [ ] Register required non-secret vars: `APP_ENV=preview`,
      `DATABASE_PROVIDER=hyperdrive`, and `STORAGE_PROVIDER=r2`.
- [ ] Install dependencies with the repository's supported npm/pnpm version.
- [ ] Run the TypeScript checks and existing tests.
- [ ] Build the React assets into `dist/public`.
- [ ] Validate the Wrangler configuration against the installed Wrangler version.
- [ ] Deploy only to the preview Worker (`wrangler deploy` with the preview config);
      do not attach a production route or custom domain.
- [ ] Test unauthenticated `GET /api/health` and confirm HTTP 200 plus
      `{ "status": "ok" }`.
- [ ] Confirm unauthenticated `GET /api/internal/db-health` returns HTTP 404.
- [ ] Test authorized `GET /api/internal/db-health` and confirm only HTTP 200/503
      plus the non-sensitive status response.
- [ ] Test direct SPA navigation for `/article/...` and `/admin/...`.
- [ ] Confirm an unmigrated `/api/*` route returns HTTP 501, not `index.html`.
- [ ] Keep DNS, production domains, OAuth callbacks, schema, migrations, and data
      unchanged.
