# ADR 0001 — Central API colocated with marketing repo

**Date:** 2026-07-09
**Status:** Accepted

## Context

Rhumint has two existing repos: `rhumint-hrms` (self-hosted HRMS app, Python/FastAPI) and
`rhumint-marketing` (product-owner marketing site). Phase 2 adds a central license/update/sales
API that must be deployed as a Cloudflare Worker. There are three options:

1. **Third repo** — Create `rhumint-central-api` as an independent repo with its own CI, issue tracker, and deploy pipeline.
2. **Inside rhumint-hrms** — Add the central API to the existing Python/FastAPI monolith.
3. **Inside rhumint-marketing** — Add as `services/central-api/` alongside the Next.js admin panel.

## Decision

Place the central API at `services/central-api/` inside the `rhumint-marketing` repo.

The central API and the marketing/admin site share the same release cycle and product-owner
context — they are not useful in isolation. They have **separate deploy targets**
(Workers vs. Pages) and **no shared runtime code**, so being in the same repo does not create
coupling. A third repo adds overhead (GitHub Actions CI duplication, npm init, issue tracker)
without benefit.

Putting it in rhumint-hrms was rejected because the central API must be always-on and
independently deployable, while rhumint-hrms is a self-hosted app that individual
customers run in their own infrastructure.

## Consequences

**Positive:**
- Single repo for all product-owner code — one pull request can update both the admin panel and the API.
- Shared CI pipeline for linting, testing, and contract checks.
- No cross-repo synchronization overhead.

**Negative:**
- The marketing repo now has two deploy targets (Workers + Pages), which is slightly more complex than one.
- If future scale demands separate access control (e.g., giving a team access to the API but not the marketing site), splitting is straightforward: copy `services/central-api/` to a new repo and update CI.
