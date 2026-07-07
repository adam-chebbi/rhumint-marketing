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

## Status

- [x] Repository scaffolded (README, STATUS.md, .gitignore)
- [x] Central API skeleton (Workers + D1)
  - [x] `wrangler.jsonc` with D1 binding
  - [x] Hono router with three route modules
  - [x] `POST /api/license/issue` — issue signed license token
  - [x] `GET /api/license/:id` — get license details
  - [x] `POST /api/license/validate` — validate token against DB
  - [x] `POST /api/license/:id/revoke` — revoke a license
  - [x] `GET /api/license` — list all licenses
  - [x] `GET /api/updates/manifest` — version manifest
  - [x] `POST /api/webhooks/gumroad` — Gumroad sale webhook receiver
  - [x] Ed25519 signing via Web Crypto API (`crypto.subtle`)
  - [x] D1 migration: `001_initial.sql` (licenses table + indexes)
  - [x] `.dev.vars.example` with documentation
- [ ] Next.js app initialized on Cloudflare Pages (`site/`)
- [ ] Gumroad webhook receiver + sale sync (endpoint exists, needs Gumroad test)
- [ ] Product-owner admin panel (sales dashboard, license CRUD)
- [ ] Marketing pages (landing, features, pricing)
- [ ] Everything below is not yet started
