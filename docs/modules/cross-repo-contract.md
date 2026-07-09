# Cross-Repo Contract: rhumint-hrms ↔ rhumint-central-api

This document is the **single source of truth** for all interfaces shared between the two repos. Both sides must agree on every endpoint, field name, type, and error code described here.

## 1. License Token Format (Offline)

The primary trust mechanism. The central API signs tokens; rhumint-hrms verifies them offline.

| Field | Type | Description |
|---|---|---|
| **Algorithm** | Ed25519 | `crypto.subtle.sign("Ed25519", ...)` / `cryptography.hazmat.primitives.asymmetric.ed25519` |
| **Encoding** | `base64url(payload).base64url(signature)` | Two dot-separated parts, no padding (`=` stripped) |
| **Canonical JSON** | `JSON.stringify` with `separators: (",", ":")` | Must match `json.dumps(payload, separators=(",", ":"))` |

**Token payload:**

```json
{
  "license_id": "uuid-string",
  "org_id": "string",
  "iat": 1749000000,
  "exp": 1780500000,
  "seats": 50,
  "modules": ["core"]
}
```

| Field | Type | Required | Notes |
|---|---|---|---|
| `license_id` | string | yes | UUID v4 |
| `org_id` | string | yes | Human-readable org identifier |
| `iat` | integer | yes | Unix timestamp seconds |
| `exp` | integer or null | yes | `null` = lifetime license |
| `seats` | integer | yes | ≥ 1 |
| `modules` | string[] | yes | Non-empty array |

**Public key:** 32-byte Ed25519 public key, base64-encoded. Embedded at build time in rhumint-hrms. Cannot derive the private key.

**rhumint-hrms:** `backend/app/core/license.py` — `verify_token()` → `LicenseClaims`.

**Central API:** `services/central-api/src/lib/crypto.ts` — `signToken()`.

---

## 2. HTTP API

All endpoints live under `https://central.rhumint.com/api/`.

### 2.1 `GET /api/license/revocations/list`

Called periodically by rhumint-hrms to fetch revoked license IDs for opportunistic offline enforcement.

**Response** `200 OK`

```json
{
  "count": 2,
  "revoked": [
    { "license_id": "uuid-1", "revoked_at": "2026-07-01T12:00:00Z" },
    { "license_id": "uuid-2", "revoked_at": "2026-07-02T12:00:00Z" }
  ]
}
```

| Field | Type | Description |
|---|---|---|
| `count` | int | Number of revoked licenses |
| `revoked` | array | List of revoked license entries |
| `revoked[].license_id` | string | UUID of the revoked license |
| `revoked[].revoked_at` | string | ISO-8601 timestamp of revocation |

**Errors:** None — always returns 200 (empty list when none revoked).

**Rate limit:** None.

---

### 2.2 `GET /api/updates/manifest`

Called by rhumint-hrms admin panel to check for available updates.

**Query params:** `?current_version=0.1.0` (optional — if omitted, `current_version` and `update_available` reflect "unknown").

**Response** `200 OK`

```json
{
  "latest_version": "0.2.0",
  "current_version": "0.1.0",
  "update_available": true,
  "blocked": false,
  "reason": null,
  "published_at": "2026-08-01T00:00:00Z",
  "changelog": "### Added\\n- Payroll module",
  "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.2.0",
  "min_upgradable_version": "0.1.0"
}
```

| Field | Type | Nullable | Description |
|---|---|---|---|
| `latest_version` | string | no | Highest version in releases table |
| `current_version` | string | yes | Client-reported version |
| `update_available` | bool | no | Whether a newer version satisfies `min_upgradable_version` |
| `blocked` | bool | no | If true, client must upgrade incrementally first |
| `reason` | string | yes | Human-readable explanation when blocked |
| `published_at` | string | yes | ISO-8601 timestamp |
| `changelog` | string | no | Markdown changelog |
| `docker_tag` | string | yes | Full container image tag |
| `min_upgradable_version` | string | yes | Minimum version that can upgrade directly |

**Errors:** None — always returns 200 (placeholder values when no releases exist).

**Rate limit:** None.

---

### 2.3 `POST /api/license/heartbeat`

Called periodically by rhumint-hrms to report its running version. Authenticated by the license token.

**Request**

```json
{
  "token": "base64url(payload).base64url(signature)",
  "version": "0.1.0"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `token` | string | yes | Valid license token |
| `version` | string | yes | Semver version string |

**Response** `200 OK`

```json
{ "success": true }
```

**Error responses:**

| Status | Body | Condition |
|---|---|---|
| 400 | `{"error": "token and version are required"}` | Missing fields |
| 400 | `{"error": "Malformed token"}` | Invalid token format |
| 400 | `{"error": "Invalid base64url encoding"}` | Token decode failure |
| 400 | `{"error": "Invalid JSON in token payload"}` | Token payload parse failure |
| 400 | `{"error": "Token missing license_id or org_id"}` | Invalid payload |
| 404 | `{"error": "License not found"}` | License ID not in DB |
| 403 | `{"error": "License revoked"}` | License has been revoked |

**Rate limit:** None.

---

### 2.4 Token Validation (Online) — `GET|POST /api/license/validate`

Used by the central API's own admin panel / support tooling. rhumint-hrms does NOT call this (it verifies offline). Documented here for completeness — see `docs/modules/license-api.md` for full details.

**GET:** `?token=...`
**POST:** `{"token": "..."}`

**Success** `200`:
```json
{ "valid": true, "license_id": "uuid", "org_id": "string", "seats": 50, "modules": ["core"] }
```

**Failure** `200`:
```json
{ "valid": false, "error": "License has been revoked", "license_id": "uuid", "revoked_at": "..." }
```

**Rate limit:** 30 requests/minute/IP. Returns 429:
```json
{ "valid": false, "error": "Rate limit exceeded", "retry_after": 42 }
```

---

## 3. Error Code Conventions

All HTTP API endpoints follow these conventions:

| Code | Meaning | Standard Body |
|---|---|---|
| 200 | Success | Varies by endpoint |
| 201 | Created | Resource-specific |
| 400 | Bad request | `{"error": "human-readable message"}` |
| 401 | Unauthorized | `{"error": "Missing or invalid authorization"}` |
| 403 | Forbidden | `{"error": "human-readable message"}` |
| 404 | Not found | `{"error": "human-readable message"}` |
| 429 | Rate limit exceeded | `{"error": "...", "retry_after": 42}` |
| 500 | Internal error | `{"error": "Internal error processing request"}` |

Error bodies always contain an `"error"` string field. The `"retry_after"` field is included only on 429 responses.

---

## 4. Version Compatibility

| Contract Version | Date | Changes |
|---|---|---|
| 1.0 | 2026-07 | Initial contract |

Both repos pin their contract dependency via CI contract-test jobs that verify the deployed central API matches this document.

---

## 5. Contract Testing

See `services/central-api/tests/contract.test.ts` (provider-side) and
`backend/tests/test_central_contract.py` (consumer-side) for automated checks.

To run:

```bash
# Provider (central API)
cd services/central-api && npm test -- contract.test.ts

# Consumer (rhumint-hrms)
cd backend && pytest tests/test_central_contract.py -v
```
