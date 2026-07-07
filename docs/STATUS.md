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
  - [x] Returns latest_version, docker_tag, changelog
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
- [ ] Next.js app initialized on Cloudflare Pages (`site/`)
- [ ] Product-owner admin panel (sales dashboard, license CRUD)
- [ ] Marketing pages (landing, features, pricing)
- [ ] Everything below is not yet started
