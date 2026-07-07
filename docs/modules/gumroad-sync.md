# Gumroad Sync — License Ingestion Flow

> This document describes how the central API ingests Gumroad sales, issues
> licenses, delivers them to buyers, and handles refunds/disputes.

---

## 1. Overview

```
Gumroad (sale event)
    │
    ▼
POST /api/webhooks/gumroad  ─── HMAC-SHA256 verification ─── 401 if invalid
    │
    ├── event=sale     → purchase record + issue license + delivery email
    ├── event=refund   → revoke license associated with the sale
    ├── event=dispute  → revoke license associated with the sale
    ├── event=dispute_won → logged, manual re-issuance required
    └── event=ping     → 200 OK (endpoint verification)
```

## 2. Endpoint

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/webhooks/gumroad` | Receive Gumroad Ping notifications |

Configure this URL in your Gumroad settings under **Settings → Advanced Features → Ping**.
Set the webhook URL to: `https://central-api.yourdomain.com/api/webhooks/gumroad`

## 3. Payload verification

Gumroad signs every webhook request with HMAC-SHA256.

### How it works

1. You set a **webhook secret** in Gumroad settings.
2. Gumroad sends the raw form-encoded body with an `X-Gumroad-Signature` header
   containing the HMAC-SHA256 hex digest.
3. The receiver:
   - Reads the **raw request body** (before any parsing).
   - Computes `HMAC-SHA256(raw_body, webhook_secret)`.
   - Compares the hex digest against `X-Gumroad-Signature` using the
     Web Crypto API's `crypto.subtle.verify()` (constant-time).
4. If the signature doesn't match, the request is rejected with HTTP 401.

### Why raw body matters

The HMAC must be computed over the raw form-encoded body as received, **not**
over re-serialized JSON or a parsed object. Gumroad computes the signature
over the raw `application/x-www-form-urlencoded` bytes. If the receiver
parses the body first (e.g., with `c.req.parseBody()`), the re-serialized
string may differ from the original (field ordering, whitespace), causing a
signature mismatch.

The handler reads `c.req.text()` before any parsing, then uses
`URLSearchParams` to extract fields from the same raw string.

### Configuration

| Key | Required | Source |
|-----|----------|--------|
| `GUMROAD_WEBHOOK_SECRET` | recommended | `wrangler secret put` — set in Gumroad settings |

If the secret is not configured, **signature verification is skipped**.
This is useful during development but must be enabled in production.

## 4. Sale ingestion flow

### Step-by-step

1. **HMAC verification** — raw body signature checked against secret.
2. **Event routing** — `event=sale` dispatched to sale handler.
3. **Field extraction** — required fields are read from the form body:

   | Form field | Type | Used for |
   |------------|------|----------|
   | `sale_id` | string | Deduplication key, purchase record |
   | `email` | string | Customer contact, delivery email recipient |
   | `product_name` | string | Purchase record metadata |
   | `product_id` | string | Product identification |
   | `amount_cents` | integer | Sale amount (for records) |
   | `currency` | string | Currency code |
   | `is_gift` | boolean | Whether the sale was a gift |
   | `timestamp` | string | Sale timestamp (for records) |

4. **Deduplication** — `getPurchaseBySaleId()` checks if the `sale_id` has
   already been processed. If so, returns 200 with `"message": "Sale already
   processed"`. This handles Gumroad's at-least-once delivery guarantee.

5. **Purchase record created** — a row in the `purchases` table records the
   sale metadata.

6. **License issued** — a signed Ed25519 token is generated with:
   - `license_id` = random UUID
   - `org_id` = `org-{first 8 chars of sale_id}`
   - `iat` = current Unix timestamp
   - `exp` = null (lifetime license)
   - `seats` = 50
   - `modules` = `["core"]`
   - The token is stored as a row in the `licenses` table.

7. **Purchase linked to license** — the `license_id` is written back to the
   purchase record.

8. **Delivery email sent** — the signed token is emailed to the buyer via
   Cloudflare Email Sending (Workers binding). The email contains:
   - The license token (string)
   - Setup instructions (Docker Compose deploy, onboarding wizard)
   - Link to the full deploy documentation
   - **Email is best-effort**: if sending fails, the license is still issued
     and the sale is recorded. The failure is logged for manual follow-up.

9. **Response** — returns `201 Created` with `{ success, license_id, token }`.

### Data model: `purchases` table

```sql
CREATE TABLE purchases (
  id              TEXT PRIMARY KEY,         -- internal UUID
  gumroad_sale_id TEXT UNIQUE NOT NULL,     -- Gumroad's sale_id (dedup key)
  email           TEXT NOT NULL,            -- buyer email
  product_name    TEXT NOT NULL,            -- e.g. "Rhumint HRMS — Self-Hosted"
  product_id      TEXT NOT NULL,            -- Gumroad product ID
  amount_cents    INTEGER NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'USD',
  is_gift         INTEGER NOT NULL DEFAULT 0,
  event_type      TEXT NOT NULL DEFAULT 'sale',  -- sale | refund | dispute
  license_id      TEXT,                     -- FK to licenses.id, set after issue
  refunded_at     TEXT,                     -- set when refund webhook received
  disputed_at     TEXT,                     -- set when dispute webhook received
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## 5. Refund/dispute handling

### Refund flow

1. Gumroad sends `event=refund` with the original `sale_id`.
2. `getPurchaseBySaleId()` looks up the purchase.
3. `markPurchaseRefunded()` sets `refunded_at`.
4. `revokeLicenseBySaleId()` revokes the associated license (sets `revoked_at`).
5. Once revoked, all future `GET|POST /api/license/validate` calls for that
   token will return `valid: false` with HTTP 403.
6. The next time the client app fetches `GET /api/license/revocations/list`,
   this license will appear in the revocation list.

### Dispute flow

Same as refund: license is revoked and marked as disputed. The dispute_won
event is logged but does **not** automatically re-issue the license.
Re-issuance is a manual action via the future admin panel.

### Important notes

- **Idempotent**: If a sale is already refunded/disputed, the handler returns
  a success response without making changes.
- **Race conditions**: If a refund arrives before the sale is fully processed,
  the handler will return 404 for the purchase lookup. This is logged for
  manual investigation. In practice, Gumroad sends refunds after sales, so
  this is extremely unlikely.

## 6. Email delivery mechanism

**Choice:** Cloudflare Email Sending (Workers binding).

### Rationale

| Criteria | Option | Verdict |
|----------|--------|---------|
| Free tier volume | Cloudflare Email Sending: 2,000 emails/day | ✅ More than enough (>1 year of sales at reasonable scale) |
| | SendGrid free: 100 emails/day | ❌ May hit limit during a successful launch day |
| | Resend free: 3,000 emails/month, 100/day | ⚠️ 100/day limit is tight during spike |
| Setup complexity | Cloudflare: add binding + onboard domain + `wrangler email sending enable` | ✅ One-time setup |
| Security | Cloudflare: native Workers binding, no API keys to manage | ✅ No secrets to leak |
| Dependencies | Zero — the `EMAIL` binding is part of the Workers runtime | ✅ No npm package |
| Sender reputation | Cloudflare handles warm-up and DKIM/SPF/DMARC | ✅ Handled by platform |

### Volume estimate

At ~100 sales in the first year (optimistic for a bootstrapped product), with
at most 2 emails per sale (initial + possible re-send if requested), the total
is ~200 emails/year — well within Cloudflare's 2,000/day free limit.

### Configuration

```jsonc
// wrangler.jsonc
{
  "send_email": [{ "name": "EMAIL", "remote": true }]
}
```

| Env var | Purpose | Default |
|---------|---------|---------|
| `EMAIL_FROM` | From address | `license@rhumint.com` |
| `EMAIL_FROM_NAME` | From display name | `Rhumint Licenses` |

The `from` domain must be onboarded:
```bash
npx wrangler email sending enable rhumint.com
```

### Email content

**Subject:** `Your Rhumint HRMS License Key`

**Body (plain text):**
```
Your license token is:

{token}

SETUP INSTRUCTIONS
1. Deploy the Docker Compose bundle on your server.
2. During the initial onboarding wizard, enter the token above.
3. The system will verify the license offline and activate.

https://github.com/adam-chebbi/rhumint-hrms/blob/main/docs/deploy.md
```

**Body (HTML):** Same content with simple styling, a code-block for the token,
and a styled link to the deploy guide.

### Error handling

Email sending is **best-effort**. If `sendLicenseEmail()` throws, the error
is logged but the response is still `201 Created` with the license and token.
The license has already been issued and stored — only the delivery failed.
The product owner must manually forward the token to the buyer.

Future improvement: a retry queue or admin panel to re-send delivery emails.

## 7. Failure/retry handling

### Gumroad delivery behavior

Gumroad delivers webhooks with **at-least-once** semantics. If the endpoint
returns a non-2xx response, Gumroad retries with exponential backoff over
several days (up to ~72 hours, at decreasing frequency).

### What can fail

| Failure point | Effect | Recovery |
|---------------|--------|----------|
| HMAC mismatch | 401 → Gumroad retries | Check `GUMROAD_WEBHOOK_SECRET` matches |
| D1 write failure (5xx) | 500 → Gumroad retries | Transient: retry succeeds. Persistent: check D1 quotas |
| Email send failure | Logged, license still issued | Manual re-send via admin panel (future) |
| Refund before sale processed | 404 logged | Gumroad will retry; sale should be processed by then |

### Idempotency

All event handlers are idempotent:
- **Sale**: `sale_id` deduplication via `getPurchaseBySaleId()` + `getLicenseBySaleId()`
  + SQL `UNIQUE` constraint on `gumroad_sale_id`.
- **Refund**: `markPurchaseRefunded()` checks `refunded_at IS NULL` before updating.
- **Dispute**: Same pattern as refund.

If Gumroad retries a sale that was already processed, the handler returns
200 with `"message": "Sale already processed"`.

### Dead-letter scenario

If the Worker is down for an extended period (exceeding Gumroad's ~72-hour
retry window), the sale will be missed. Detection:
- Regularly check Gumroad's dashboard for unprocessed sales.
- Cross-reference Gumroad's sales CSV export against the `purchases` table.
- Future improvement: a scheduled Worker (cron trigger) that polls Gumroad's
  API for recent sales as a backup sync mechanism.

## 8. Manual testing

### Simulate a Gumroad sale locally

```bash
# Generate a valid HMAC signature
SECRET="test_secret"
BODY="event=sale&sale_id=test-001&email=buyer@example.com&product_name=Rhumint+HRMS&product_id=123&amount_cents=2999&currency=USD"
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

# Send to local dev server
curl -X POST http://localhost:8787/api/webhooks/gumroad \
  -H "X-Gumroad-Signature: $SIG" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$BODY"
```

### Test refund

```bash
BODY="event=refund&sale_id=test-001"
SIG=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://localhost:8787/api/webhooks/gumroad \
  -H "X-Gumroad-Signature: $SIG" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "$BODY"
```

### Verify the license

```bash
# Get the token from the sale response, then:
curl -X POST http://localhost:8787/api/license/validate \
  -H "Content-Type: application/json" \
  -d '{"token": "eyJ..."}'
```

### View the revocation list

```bash
curl http://localhost:8787/api/license/revocations/list
```

---

## 9. References

- [License API contract](license-api.md) — full API documentation
- [ADR 0002](../adr/0002-license-token.md) — offline-first Ed25519 verification design
- Cloudflare Email Sending docs: https://developers.cloudflare.com/email-service/
- Gumroad Ping settings: https://app.gumroad.com/settings/advanced
