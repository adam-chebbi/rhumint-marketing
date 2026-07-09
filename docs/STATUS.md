# STATUS.md — Rhumint Central License/Update/Sales API

> Living document for the central API deployed as a Cloudflare Worker with D1.
> This is NOT the marketing site — that lives under `site/` and has its own separate deploy.
> See also `services/central-api/README.md` for local dev setup.

## Architecture decision: `services/central-api/` vs. standalone repo

Chose to keep the central API inside the `rhumint-marketing` repo (under `services/central-api/`)
rather than a third repo. Rationale:

- The central API and the marketing/admin site (Next.js on Cloudflare Pages) share
  the same release cycle and product-owner context — they are not useful in isolation.
- They have **separate deploy targets** (Workers vs. Pages) and **no shared code at runtime**,
  so putting them in the same repo does not create coupling.
- A third repo adds overhead (GitHub Actions CI duplication, npm init, issue tracker)
  without benefit.

If future scale or access-control requirements demand separation, splitting into a
standalone repo is straightforward: copy the directory, create a new repo, and update
CI deploy targets.

## Configuration

| Key | Where | Purpose |
|-----|-------|---------|
| `ED25519_PRIVATE_KEY` | `wrangler secret put` | Signs license tokens. NEVER in rhumint-hrms. |
| `GUMROAD_WEBHOOK_SECRET` | `wrangler secret put` | Verifies Gumroad webhook payloads (optional). |
| `RELEASE_API_KEY` | `wrangler secret put` | Authenticates CI publish calls to POST /api/updates/publish. |
| `ADMIN_API_KEY` | `wrangler secret put` | Authenticates admin panel calls to GET /api/admin/*. |
| `ENVIRONMENT` | `wrangler.jsonc` vars | `production` or `development`. |

The **Ed25519 private key** is the most sensitive credential in the entire Rhumint
system. It is stored exclusively as a Cloudflare Worker secret and never checked into
version control, never embedded in any Docker image, and never distributed to clients.
The corresponding public key is embedded at build time in `rhumint-hrms` and is the
only key the shipped app knows about.

## Deployment target: Cloudflare Free Tier

| Resource | Free tier limit | Estimated usage at scale | Headroom |
|----------|----------------|--------------------------|----------|
| Workers requests | 100,000/day | ~100 requests/day (1 license issue + N validations) | 1000x |
| Workers CPU time | 10ms/request | <1ms/request (Ed25519 sign + D1 lookup) | 10x |
| D1 storage | 5 GB | <1 MB (thousands of license rows) | 5000x |
| D1 rows read | 5,000,000/month | <10,000/month | 500x |
| D1 rows written | 500,000/month | <1,000/month | 500x |

**Conclusion:** No paid tier is required. At reasonable scale (hundreds of client
deployments), the service stays comfortably within Cloudflare's free allocation.
If the service grows to thousands of daily validation requests, the Workers Paid
plan ($5/month) covers 10x the free limits.

## API contract

The full, versioned API contract is documented at `docs/modules/license-api.md`.
This is the **single source of truth** for the HTTP contract between
`rhumint-hrms` and `rhumint-central-api`. Both repos must agree on every
endpoint, field, error code, and token format described there.

### Token payload format

Token payload fields MUST match what `rhumint-hrms` expects:

```
license_id, org_id, iat, exp (null for lifetime), seats, modules
```

The field names `iat` and `exp` (not `issued_at`/`expires_at`) are critical —
`rhumint-hrms` parses these exact names in `LicenseClaims._parse_claims()`.

## Status

- [x] Repository scaffolded (README, STATUS.md, .gitignore)
- [x] Central API skeleton (Workers + D1)
  - [x] `wrangler.jsonc` with D1 binding
  - [x] Hono router with three route modules
  - [x] Ed25519 signing via Web Crypto API (`crypto.subtle`)
  - [x] D1 migration: `001_initial.sql` (licenses table + indexes)
  - [x] `.dev.vars.example` with documentation
- [x] License issuing endpoint (`POST /api/license/issue`)
  - [x] Validates inputs (org_id, seats > 0, modules non-empty)
  - [x] Signs Ed25519 token with correct field names (`license_id`, `org_id`, `iat`, `exp`, `seats`, `modules`)
  - [x] Stores license record in D1
  - [x] Returns token string + license_id
- [x] Online validation endpoint (`GET|POST /api/license/validate`)
  - [x] Accepts token via query param (GET) or body (POST)
  - [x] Decodes payload to extract license_id
  - [x] Looks up license in D1 (revoked? expired? exists?)
  - [x] Returns `valid: true/false` with metadata
- [x] License details endpoint (`GET /api/license/:id`)
- [x] License list endpoint (`GET /api/license`)
- [x] Revocation endpoint (`POST /api/license/:id/revoke`)
  - [x] Marks license as revoked (idempotent)
- [x] Revocation list endpoint (`GET /api/license/revocations/list`)
  - [x] Returns array of `{license_id, revoked_at}` for all revoked licenses
  - [x] Used by `rhumint-hrms` for opportunistic offline revocation checks
- [x] Version manifest endpoint (`GET /api/updates/manifest`)
  - [x] Returns latest_version, docker_tag, changelog, min_upgradable_version
  - [x] Accepts `current_version` query param to compute `update_available`/`blocked`
  - [x] Semver comparison (major.minor.patch tuple)
  - [x] `POST /api/updates/publish` — CI pipeline publishes new releases
    - [x] Bearer token auth via `RELEASE_API_KEY` secret
    - [x] Validates version format (semver, required), docker_tag (required)
    - [x] Idempotent: returns existing release on duplicate version
  - [x] `GET /api/updates/releases` — list all releases
  - [x] `GET /api/updates/releases/:version` — get specific release
  - [x] D1 migration: `003_releases.sql` (releases table + index)
  - [x] Types (`Release`, `UpdateManifest`) and DB helpers (`createRelease`, `getLatestRelease`, `getReleaseByVersion`, `listReleases`)
  - [x] Documentation in `docs/modules/update-manifest.md`
- [x] Gumroad webhook endpoint (`POST /api/webhooks/gumroad`)
  - [x] HMAC-SHA256 signature verification on raw body (constant-time via Web Crypto API)
  - [x] Event routing: sale → purchase + license + email; refund/dispute → revoke; ping → 200
  - [x] Deduplication by sale_id (idempotent — SQL UNIQUE + existence check)
  - [x] Auto-issues lifetime license on valid sale
  - [x] Linked purchase record in new `purchases` table (migration 002)
  - [x] Delivery email via Cloudflare Email Sending (2,000/day free tier)
  - [x] Email is best-effort: failure logged, license still issued
  - [x] D1 `batch()` for atomic purchase + license insert
- [x] Gumroad sync documentation in `docs/modules/gumroad-sync.md`
  - [x] Payload verification explained (why raw body matters)
  - [x] Full ingestion flow diagram
  - [x] Failure/retry handling (Gumroad's at-least-once, idempotency, dead-letter)
  - [x] Email delivery mechanism choice rationale (Cloudflare vs SendGrid vs Resend)
  - [x] Manual testing commands (HMAC signature generation, curl examples)
- [x] API contract documented in `docs/modules/license-api.md`
- [x] Admin API endpoints (`src/routes/admin.ts`)
  - [x] `GET /api/admin/purchases` — all purchases with joined license info
  - [x] `GET /api/admin/stats` — total revenue, active/refunded counts, monthly revenue series
  - [x] Bearer-token auth via `ADMIN_API_KEY` secret
- [x] Extend license endpoint (`POST /api/license/:id/extend`)
  - [x] Updates expires_at in DB, returns new signed token
- [x] Next.js 14 App Router admin panel scaffolded (`site/`)
  - [x] Tailwind CSS, TypeScript, standalone output
- [x] Single-user auth (HMAC-signed session cookie, 24h expiry)
  - [x] Login page at `/login` with `ADMIN_PASSWORD`
  - [x] Middleware redirects unauthenticated requests
  - [x] Logout button in sidebar
- [x] Sales dashboard (`/dashboard`)
  - [x] 4 stat cards: Total Revenue, Active Licenses, Total Purchases, Refunded
  - [x] Monthly revenue bar chart (CSS-only, no chart library)
  - [x] Recent purchases table (last 20, with status badges)
- [x] License management (`/licenses`)
  - [x] Client-side search by org/email/ID
  - [x] Status badges (Active/Expired/Revoked)
  - [x] Issue License modal with form (org, email, seats, modules, expiry)
  - [x] Token display with copy button after issue
  - [x] License detail page (`/licenses/[id]`)
    - [x] Full metadata display
    - [x] Extend action (date input → new token)
    - [x] Revoke action (confirmation dialog)
- [x] Admin panel documentation in `docs/modules/admin-panel.md`
- [x] Support ticket log (`/tickets`)
  - [x] Tickets table (migration 004) + types + DB helpers (list, create, close)
  - [x] `GET /api/admin/tickets`, `POST /api/admin/tickets`, `POST /api/admin/tickets/:id/close`
  - [x] Ticket cards with priority badge, org, contact, description, timestamps
  - [x] Filter tabs: All / Open / Closed
  - [x] New Ticket form with subject, org, email, description, priority
  - [x] Inline close button on open tickets
- [x] Client version tracking (`/versions`)
  - [x] Heartbeats table (migration 005) + types + DB helpers
  - [x] `POST /api/license/heartbeat` — client reports version (authenticated by license token)
  - [x] `GET /api/admin/versions` — latest heartbeat per org
  - [x] Versions page with org, version badge, license ID, last reported timestamp
- [x] Security baseline (migration 006 + libs + docs)
  - [x] D1-backed sliding-window rate limiter (`src/lib/rate-limit.ts`)
    - [x] Applied to `POST /api/license/validate` (30 req/min/IP)
    - [x] Applied to `POST /api/webhooks/gumroad` (10 req/min/IP)
    - [x] 429 response with `retry_after` in seconds
    - [x] Automatic cleanup of stale entries (older than 2 windows)
  - [x] Validation audit logging + anomaly detection (`src/lib/anomaly.ts`)
    - [x] Every validation attempt logged to `audit_log` table (success + failure)
    - [x] Failure rate check: if >= 20 failures/hour from one org, `anomaly_alert` event written
    - [x] `console.warn()` emitted for Workers console observability
  - [x] `ED25519_PRIVATE_KEY` stored exclusively as `wrangler secret put` (never in source, never client-visible)
  - [x] Gumroad webhook HMAC verification on raw body (already in place, documented in security doc)
  - [x] Secrets inventory documented with rotation procedure
  - [x] Full documentation in `docs/modules/central-service-security.md`
- [x] Cross-repo contract documented in `docs/modules/cross-repo-contract.md`
  - [x] License token format (Ed25519, base64url, canonical JSON, field names)
  - [x] HTTP endpoints: revocations list, version manifest, heartbeat
  - [x] Error code conventions (400/401/403/404/429/500)
  - [x] Version compatibility table
  - [x] Contract testing instructions
- [x] Provider contract tests (`services/central-api/tests/contract.test.ts`)
  - [x] Revocations list: top-level shape, empty list, entry structure
  - [x] Health endpoint shape
  - [x] Error code conventions: 404 with error field, 400 with error field
- [ ] Marketing pages (landing, features, pricing)
- [ ] Everything below is not yet started
