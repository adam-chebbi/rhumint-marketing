# ADR 0005 — D1-backed sliding-window rate limiter

**Date:** 2026-07-09
**Status:** Accepted

## Context

The central API's validation and webhook endpoints need rate limiting to prevent abuse.
Options:

1. **Cloudflare Rate Limiting (WAF)** — Product-level feature, $5/month for 10 rules. Cannot read Worker context (can't rate-limit by org_id, only by IP).
2. **Upstash Redis** — 10,000 commands/day free tier. Adds an external dependency and network hop.
3. **D1-backed sliding window** — Uses the existing D1 database. No additional infrastructure, no extra cost. Sliding window via `INSERT ON CONFLICT DO UPDATE` with timestamp cleanup.

## Decision

Build the rate limiter on D1 using a `rate_limits` table with sliding-window logic.

## Consequences

**Positive:**
- Zero additional infrastructure cost — D1 is already provisioned.
- Per-key scoping (by IP, by org_id, or any combination) is trivial — it's just a WHERE clause.
- D1's `INSERT ... ON CONFLICT DO UPDATE` maps naturally to sliding-window increments.
- Stale entry cleanup is built in: every check purges entries older than 2 windows.

**Negative:**
- Adds read+write latency to every rate-limited request (~5ms D1 query). Acceptable for low-volume endpoints.
- D1 free tier limits: 5M rows read/month, 500K rows written/month. A heavily abused endpoint could approach these limits — mitigated by the fact that the rate limiter itself limits request volume.
