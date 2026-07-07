# License API — Contract

> This document is the **single source of truth** for the HTTP contract between
> `rhumint-hrms` (the self-hosted HRMS app) and `rhumint-central-api`
> (the product-owner license/update/sales service).
>
> Both repos must agree on every endpoint, field, error code, and token format
> described here. If one side changes, this doc must be updated in the same commit.

**Base URL (production):** `https://central-api.yourdomain.com`  
**Base URL (local dev):** `http://localhost:8787`

---

## Table of contents

1. [Token format](#1-token-format)
2. [Error format](#2-error-format)
3. [Endpoints](#3-endpoints)
   - [`POST /api/license/issue` — Issue a license](#post-apilicenseissue--issue-a-license)
   - [`GET /api/license/validate` — Validate a token](#get-apilicensevalidate--validate-a-token)
   - [`POST /api/license/validate` — Validate a token (POST)](#post-apilicensevalidate--validate-a-token-post)
   - [`GET /api/license/:id` — Get license details](#get-apilicenseid--get-license-details)
   - [`POST /api/license/:id/revoke` — Revoke a license](#post-apilicenseidrevoke--revoke-a-license)
   - [`GET /api/license/revocations/list` — Revocation list](#get-apilicenserevocationslist--revocation-list)
   - [`GET /api/license` — List all licenses](#get-apilicense--list-all-licenses)
   - [`GET /api/updates/manifest` — Version manifest](#get-apiupdatesmanifest--version-manifest)
   - [`POST /api/webhooks/gumroad` — Gumroad sale webhook](#post-apiwebhooksgumroad--gumroad-sale-webhook)
4. [Token format reference](#4-token-format-reference)
5. [Error codes reference](#5-error-codes-reference)

---

## 1. Token format

All license tokens are Ed25519-signed opaque strings with this structure:

```
base64url(JSON payload).base64url(Ed25519 signature)
```

### Payload fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `license_id` | string | yes | UUID v4, globally unique |
| `org_id` | string | yes | Organization identifier, assigned at issue time |
| `iat` | integer | yes | Unix timestamp (seconds) when the token was issued |
| `exp` | integer \| null | yes | Unix timestamp when the token expires, or `null` for lifetime |
| `seats` | integer | yes | Maximum number of employee seats (≥1) |
| `modules` | string[] | yes | Enabled module codes (e.g. `["core", "payroll"]`) |

### Signature

Ed25519, applied to the canonical JSON of the payload (compact encoding:
no whitespace between keys/values). Private key held **exclusively** by the
central service (`rhumint-central-api`). Public key embedded at build time
in `rhumint-hrms`.

### Client-side verification (primary path)

The `rhumint-hrms` app performs offline Ed25519 verification on every startup
and periodically thereafter. This is the primary trust mechanism — no network
call is required. If the signature is invalid, the app hard-blocks.

### Server-side online check (opportunistic)

The `GET/POST /api/license/validate` endpoint is called **opportunistically**
by `rhumint-hrms` to check revocation status. If the central API is unreachable,
the app continues with the last known status. This is a best-effort secondary
check, not a primary trust mechanism.

---

## 2. Error format

All error responses follow a uniform structure:

```json
{
  "error": "Human-readable error description"
}
```

Validation errors (400/422) may include additional fields:

```json
{
  "error": "org_id and seats are required"
}
```

Auth errors return just the `error` string. See each endpoint for specific
status codes and error messages.

---

## 3. Endpoints

### `POST /api/license/issue` — Issue a license

Creates a new license record and returns a signed token string. The token
can be distributed to the client for offline activation.

#### Request

```json
{
  "org_id": "org-abc12345",
  "seats": 50,
  "modules": ["core"],
  "exp": "2027-07-07T00:00:00Z",
  "gumroad_sale_id": "abc123-def456",
  "customer_email": "customer@example.com"
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `org_id` | string | yes | — | Organization identifier |
| `seats` | integer | yes | — | Max employee seats (≥1) |
| `modules` | string[] | no | `["core"]` | Enabled module codes |
| `exp` | string \| null | no | `null` (lifetime) | ISO 8601 expiry datetime, or `null` |
| `gumroad_sale_id` | string | no | `null` | Gumroad sale to tie to |
| `customer_email` | string | no | `null` | Customer email for CRM |

#### Success response — `201 Created`

```json
{
  "license_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "eyJsaWNlbnNl...abc.6gL9z3..."
}
```

#### Error cases

| Status | Condition | Error message |
|--------|-----------|---------------|
| 400 | `org_id` missing or empty | `"org_id and seats are required"` |
| 400 | `seats` < 1 | `"seats must be a positive integer"` |
| 400 | `modules` empty or missing | `"modules must be a non-empty array"` |

---

### `GET /api/license/validate` — Validate a token

Validates a license token against the central registry. Used by `rhumint-hrms`
for the opportunistic online check (non-blocking, best-effort).

#### Request

```
GET /api/license/validate?token=eyJsaWNlbnNl...abc.6gL9z3...
```

#### Success response — `200 OK` (valid)

```json
{
  "valid": true,
  "license_id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "org-abc12345",
  "seats": 50,
  "modules": ["core"]
}
```

#### Error cases

| Status | Condition | Body |
|--------|-----------|------|
| 400 | Missing token | `{"error": "token query parameter is required"}` |
| 400 | Token has wrong number of parts | `{"error": "Malformed token: expected 2 dot-separated parts"}` |
| 400 | Base64 decode failure | `{"error": "Invalid base64url encoding in token payload"}` |
| 400 | Payload is not valid JSON | `{"error": "Invalid JSON in token payload"}` |
| 400 | Payload missing `license_id` | `{"error": "Token payload missing license_id"}` |
| 404 | License ID not in registry | `{"error": "License not found in registry"}` |
| 403 | License is revoked | `{"valid": false, "error": "License has been revoked", "license_id": "...", "revoked_at": "..."}` |
| 403 | License is expired | `{"valid": false, "error": "License has expired", "license_id": "...", "expires_at": "..."}` |

---

### `POST /api/license/validate` — Validate a token (POST)

Same as `GET /api/license/validate` but accepts the token in the request body.

#### Request

```json
{
  "token": "eyJsaWNlbnNl...abc.6gL9z3..."
}
```

#### Responses

Same status codes and body shapes as GET variant.

#### Error cases

| Status | Condition | Error message |
|--------|-----------|---------------|
| 400 | Missing token body field | `"token is required"` |
| 400 | (all same decode errors as GET) | |

---

### `GET /api/license/:id` — Get license details

Returns full metadata for a license record.

#### Request

```
GET /api/license/550e8400-e29b-41d4-a716-446655440000
```

#### Success response — `200 OK`

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "org_id": "org-abc12345",
  "seats": 50,
  "modules": ["core"],
  "issued_at": "2026-07-07T12:00:00Z",
  "expires_at": "2027-07-07T00:00:00Z",
  "revoked_at": null,
  "gumroad_sale_id": "abc123-def456",
  "customer_email": "customer@example.com",
  "created_at": "2026-07-07T12:00:00Z"
}
```

#### Error cases

| Status | Condition | Error message |
|--------|-----------|---------------|
| 404 | License ID not found | `"License not found"` |

---

### `POST /api/license/:id/revoke` — Revoke a license

Marks a license as revoked. Once revoked, all validation requests will return
`valid: false` with status 403. Revocation is permanent (no un-revoke).

#### Request

```
POST /api/license/550e8400-e29b-41d4-a716-446655440000/revoke
```

#### Success response — `200 OK`

```json
{
  "success": true
}
```

#### Error cases

| Status | Condition | Error message |
|--------|-----------|---------------|
| 404 | License not found or already revoked | `"License not found or already revoked"` |

---

### `GET /api/license/revocations/list` — Revocation list

Returns all revoked license IDs with their revocation timestamps. Used by
`rhumint-hrms` for periodic offline revocation checking. The client app
downloads this list and compares against its own license ID locally.

#### Request

```
GET /api/license/revocations/list
```

#### Success response — `200 OK`

```json
{
  "count": 2,
  "revoked": [
    { "license_id": "550e8400-e29b-41d4-a716-446655440000", "revoked_at": "2026-08-01T10:00:00Z" },
    { "license_id": "550e8400-e29b-41d4-a716-446655440001", "revoked_at": "2026-08-02T14:30:00Z" }
  ]
}
```

#### Error cases

None. Returns `count: 0` with empty array if no licenses are revoked.

---

### `GET /api/license` — List all licenses

Returns all license records, most recently created first.

#### Request

```
GET /api/license
```

#### Success response — `200 OK`

```json
{
  "licenses": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "org_id": "org-abc12345",
      "seats": 50,
      "modules": "[\"core\"]",
      "issued_at": "2026-07-07T12:00:00Z",
      "expires_at": "2027-07-07T00:00:00Z",
      "revoked_at": null,
      "gumroad_sale_id": "abc123-def456",
      "customer_email": "customer@example.com",
      "created_at": "2026-07-07T12:00:00Z"
    }
  ]
}
```

---

### `GET /api/updates/manifest` — Version manifest

Returns the latest available version of the HRMS product. Checked periodically
by the client app to display update notifications.

#### Request

```
GET /api/updates/manifest
```

#### Success response — `200 OK`

```json
{
  "latest_version": "0.1.0",
  "published_at": "2026-07-07T00:00:00Z",
  "changelog": "Initial MVP release. See https://github.com/adam-chebbi/rhumint-hrms/releases for details.",
  "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.1.0",
  "min_upgradable_version": "0.1.0"
}
```

#### Error cases

None. The manifest is static until a new version is published.

---

### `POST /api/webhooks/gumroad` — Gumroad sale webhook

Receives a Gumroad "sale" ping notification and auto-issues a lifetime license
for the purchaser. Called by Gumroad's webhook system (configured in Gumroad
settings → Ping → Webhook URL).

#### Request

Gumroad sends `application/x-www-form-urlencoded` POST data. The receiver
parses form fields. Key fields used:

| Form field | Type | Used for |
|------------|------|----------|
| `sale_id` | string | Deduplication (idempotency key) |
| `email` | string | Customer contact |
| `product_name` | string | Product purchased |
| `product_id` | string | Gumroad product ID |
| `license_key` | string | Gumroad's legacy license key (stored but not used) |
| `timestamp` | string | Sale timestamp |
| `amount_cents` | string | Sale amount (integer cents) |
| `currency` | string | Currency code |
| `is_gift` | string | `"true"` or `"false"` |

Webhook verification: If `GUMROAD_WEBHOOK_SECRET` is configured, the Worker
checks the `X-Gumroad-Signature` header against it. If the header is missing
or doesn't match, the request is rejected with 401.

#### Success response — `201 Created`

```json
{
  "success": true,
  "license_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "eyJsaWNlbnNl...abc.6gL9z3..."
}
```

#### Idempotent response — `200 OK`

If the `sale_id` has already been processed, returns the existing license:

```json
{
  "message": "Sale already processed",
  "license_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### Error cases

| Status | Condition | Error message |
|--------|-----------|---------------|
| 400 | `sale_id` missing | `"sale_id is required"` |
| 401 | Webhook signature mismatch | `"Invalid signature"` |

---

## 4. Token format reference

### Generating a token (product owner)

1. Generate an Ed25519 key pair:
   ```bash
   openssl genpkey -algorithm ed25519 -out private.pem
   openssl pkey -in private.pem -pubout -out public.pem
   ```
2. Set `private.pem` as the Cloudflare Worker secret `ED25519_PRIVATE_KEY`.
3. Base64-encode `public.pem` and embed it in `rhumint-hrms` at
   `backend/app/core/license.py:_BUILD_TIME_PUBLIC_KEY_B64`.

### Verifying a token (client app)

```python
# rhumint-hrms uses Ed25519PublicKey.verify()
claims = verify_token(token, public_key)
# claims: LicenseClaims(org_id, iat, exp, license_id, seats, modules)
```

### Payload JSON (canonical compact form)

```json
{"license_id":"...","org_id":"...","iat":...,"exp":...,"seats":...,"modules":[...]}
```

### Token string example

```
eyJsaWNlbnNlX2lkIjoiNTUwZTg0MDAtZTI5Yi00MWQ0LWE3MTYtNDQ2NjU1NDQwMDAwIiwib3JnX2lkIjoib3JnLWF
iYzEyMzQ1IiwiaWF0IjoxNzI4MzA3MjAwLCJleHAiOm51bGwsInNlYXRzIjo1MCwibW9kdWxlcyI6WyJjb3JlIl19.6g
L9z3abc123def456...
```

---

## 5. Error codes reference

| HTTP Status | Meaning | When |
|-------------|---------|------|
| `200` | Success | GET/POST succeeded |
| `201` | Created | Resource created (issue, webhook) |
| `400` | Bad request | Missing required field, malformed input |
| `401` | Unauthorized | Webhook signature invalid |
| `403` | Forbidden | License revoked or expired |
| `404` | Not found | License ID not in registry |
| `405` | Method not allowed | Wrong HTTP method |
| `429` | Too many requests | Rate limit exceeded (future) |
| `500` | Internal error | Unexpected server failure |

---

## Contract validation

Both repos should maintain tests that verify the token format matches:

- `rhumint-hrms`: `tests/test_license.py` — generates tokens, verifies them
  offline with the embedded public key.
- `rhumint-central-api`: should have tests that generate tokens with the
  same payload shape and confirm `rhumint-hrms` can verify them.

When adding new fields to the token payload, update both repos' type
definitions simultaneously.
