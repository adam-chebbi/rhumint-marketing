# Central Service Security

Security baseline applied to the Central API (Cloudflare Worker + D1).

## 1. Private Key Isolation

The Ed25519 signing private key (`ED25519_PRIVATE_KEY`) is stored **exclusively** as a Cloudflare Worker secret:

```
npx wrangler secret put ED25519_PRIVATE_KEY
```

The key is:
- Never checked into version control (not in `wrangler.jsonc`, not in `.dev.vars`)
- Never embedded in Docker images or client bundles
- Never exposed through any API response or log
- Accessed only at signing time through `env.ED25519_PRIVATE_KEY`

The corresponding **public key** is embedded at build time into `rhumint-hrms`
(`backend/app/core/license.py`) and is the only key the shipped app knows about.
Ed25519 public keys cannot derive the private key — distribution is safe.

## 2. Webhook Signature Verification

**Gumroad** — HMAC-SHA256 over the raw form-encoded body:

- Secret stored as `GUMROAD_WEBHOOK_SECRET` Worker secret (optional — check is skipped if unset)
- Signature sent in `X-Gumroad-Signature` header
- Verified via `crypto.subtle.verify()` with constant-time comparison path
- Raw body (`c.req.text()`) is read **before** any parsing — re-serialized JSON changes field order and breaks the HMAC
- If the signature is missing or invalid, the request is rejected with 401

Any future webhook integrations must use the same pattern: store the shared secret as a Worker secret, verify the HMAC on raw bytes before any processing.

## 3. Rate Limiting

D1-backed sliding-window rate limiter in `src/lib/rate-limit.ts`.

**Mechanism:**

| Detail | Value |
|---|---|
| Window | 60-second fixed window (`floor(now/60) * 60`) |
| Storage | `rate_limits` table (IP + route + window_ts composite primary key) |
| Increment | `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1` |
| Cleanup | Stale entries older than 2 windows are deleted on each check |

**Per-endpoint limits:**

| Route | Max requests / minute | Rationale |
|---|---|---|
| `POST /api/license/validate` (GET and POST) | 30 | Client apps validate on startup or periodically; 30/min covers many concurrent instances |
| `POST /api/webhooks/gumroad` | 10 | Gumroad sends webhooks serially per sale — 10/min is generous |

**429 response:**

```json
{
  "valid": false,
  "error": "Rate limit exceeded",
  "retry_after": 42
}
```

The `retry_after` field tells the client how many seconds to wait before retrying.

Rate limiting is applied **inline** at the handler level (not as middleware) for clarity. If more endpoints need rate limiting in the future, a Hono middleware wrapper can be created.

## 4. Anomaly Logging

Validation events (success and failure) are logged to the `audit_log` table. Failures trigger an anomaly check.

**audit_log schema:**

```sql
CREATE TABLE audit_log (
  id         TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,      -- 'validate_success', 'validate_failure', 'anomaly_alert'
  org_id     TEXT,
  license_id TEXT,
  ip         TEXT,
  details    TEXT,               -- JSON with error info
  created_at TEXT NOT NULL
);
```

**Anomaly detection logic** (in `src/lib/anomaly.ts`):

1. Every validation failure with a known `org_id` triggers a query:
   `SELECT COUNT(*) FROM audit_log WHERE org_id = ? AND event_type = 'validate_failure' AND created_at > 1 hour ago`
2. If the count >= 20, an `anomaly_alert` event is written to the audit log with the failure count and threshold
3. A `console.warn()` message is emitted for Workers observability

**What this catches:**

- **License key sharing / abuse**: If a single org's token is shared publicly, many different IPs will attempt to validate it, generating a spike in failures (since the license DB lookup would succeed but the client's offline Ed25519 check would fail — clients don't call `/validate` unless they trust the token, but a brute-force scenario would generate failures)
- **Misconfigured clients**: An org repeatedly hitting validation with an expired/revoked token
- **Replay attacks**: Rapid re-validation of a captured token against the online endpoint

**Limitations (current MVP):**

- No alert delivery (email, webhook, Slack) — anomalies are only logged to Workers console and the `audit_log` table
- No automated blocking — an anomaly alert does not auto-revoke or auto-block
- Threshold is hardcoded at 20 failures/hour — no adaptive baseline yet
- Future: add an admin panel view for the audit log, and optionally wire anomaly alerts to email or webhook

## 5. Secrets Inventory

| Secret | Storage | Rotatable | Exposed to clients |
|---|---|---|---|
| `ED25519_PRIVATE_KEY` | `wrangler secret put` | Yes | Never |
| `GUMROAD_WEBHOOK_SECRET` | `wrangler secret put` | Yes | Never |
| `RELEASE_API_KEY` | `wrangler secret put` | Yes | Never (admin panel / CI only) |
| `ADMIN_API_KEY` | `wrangler secret put` | Yes | Never (admin panel only) |
| `ADMIN_PASSWORD` | Cloudflare Pages env | Yes | Never (login form only) |

Rotation procedure: update the secret via `wrangler secret put`, then redeploy. The old value is replaced immediately.
