# Phase 2 Manual QA Log

**Date:** 2026-07-09
**Build:** central-api `137c8dd..e6c1367`, rhumint-hrms `b4d8614..87bcfa0`

## Summary

| Component | Status |
|-----------|--------|
| Central API contract tests (Vitest) | 13/13 PASS |
| rhumint-hrms consumer contract tests | 18/18 PASS |
| rhumint-hrms unit tests | 98/98 PASS |
| rhumint-hrms manual QA (MVP flows) | 7 sections, 2 expected issues |
| Central API live integration (wrangler dev) | SKIPPED — Windows process management issue |

## Issues Found & Fixed

### Fixed during QA

| # | Component | Issue | Fix |
|---|-----------|-------|-----|
| 1 | contract.test.ts | D1 mock didn't support `prepare().all()` — only `prepare().bind().all()`. Caused 3 contract test failures (revocations list). | Fixed mock to support both call patterns. All 13 tests pass. |
| 2 | admin.ts auth middleware | `requireAdmin()` called `c.json()` but returned `false`, not the Response. Hono returned 500 "Context is not finalized" instead of 401. | Changed `requireAdmin` to return `Response | null`. Handlers return it directly. |
| 3 | leave_attendance __init__.py | `LeaveRequest.workflow` set AFTER `@entity` decorator. Entity definition captured `workflow=None`, so transition routes were never registered. All POST `.../transition` calls returned 404. | Added `get_entity("leave_request").workflow = ...` re-registration after workflow assignment. |
| 4 | leave_attendance __init__.py | `update_balance_on_transition()` called `default_storage.update(params["record_id"], ...)` without entity name argument. Missing `"leave_request"` caused TypeError. | Added `"leave_request"` entity name to all `update()` calls in the hook. |
| 5 | manual_qa.py | Transition calls used `to_status` query param but router expects `to_state`. All employee/manager transition calls returned 422. | Changed `to_status: "submitted"` to `to_state: "submitted"` in all QA script calls. |
| 6 | manual_qa.py | License token `"dev-license-bypass"` was not valid 2-part format. Token format validation added to setup endpoint rejected it with 400. | Changed token to valid format `"eyJkZXYiOnRydWV9.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"`. |
| 7 | setup.py | No token format validation — DevLicenseManager accepted anything in dev mode. Malformed/tampered tokens returned 200 instead of 400. | Added `_validate_token_format()` to check 2-part base64url structure before calling `verify_and_cache()`. |
| 8 | router.py | `get_record` called `_require_action` before fetching record, so "own" scope check had `owner_id=None` and always denied employee role with 403. | Moved permission check after record fetch, using `record.get("user_id")` as owner_id. |
| 9 | router.py | `list_records` treated "own" scope as hard deny (same `owner_id=None` issue). Employee role got 403 on attendance list. | Scope-based rules for list operations pass through — `before_list` hooks handle actual filtering. |

### Expected / Unresolved

| # | Component | Issue | Reason |
|---|-----------|-------|--------|
| 1 | Setup QA | "Setup is not pre-complete" — TestClient startup seeds org+admin data, so `determine_setup_status()` returns `complete` after reset. | TestClient limitation. Only affects QA script, not production. |
| 2 | TOTP enrollment | `POST /api/v1/auth/totp/enroll` returns 404. | 2FA deferred to Phase 3. No endpoint exists yet. |

## Test Results

### Central API (Vitest contract tests)

```
✓ tests/contract.test.ts (13 tests)
  ✓ POST /api/license/issue — issues license with correct token format
  ✓ POST /api/license/issue — rejects missing required fields
  ✓ POST /api/license/:id/extend — returns 404 for nonexistent license
  ✓ POST /api/license/:id/revoke — returns 404 for nonexistent license
  ✓ GET /api/license/revocations/list — correct top-level shape
  ✓ GET /api/license/revocations/list — empty list
  ✓ GET /api/license/revocations/list — each entry has correct shape
  ✓ GET /health — correct shape
  ✓ Error code conventions — 404 with error field
  ✓ Error code conventions — 400 with error field
  ✓ Admin API — rejects unauthenticated requests with 401
  ✓ Admin API — rejects wrong API key with 401
  ✓ POST /api/webhooks/gumroad — rejects missing signature with 401
```

### rhumint-hrms (pytest)

```
98 passed in 14.95s
  — test_auth.py: 22
  — test_central_contract.py: 18
  — test_doctype_engine.py: 5
  — test_license.py: 13
  — test_organization.py: 8
  — test_security.py: 15
  — test_setup.py: 17
```

### rhumint-hrms Manual QA (MVP flows)

```
Sections: 7 checked
Issues found: 2 (both expected — see above)
All functional flows PASS:
  ✓ Fresh onboarding wizard (5/6 pass, 1 expected)
  ✓ License validation error handling (6/6)
  ✓ Employee CRUD + org-chart (13/13)
  ✓ Leave request / approval cycle (9/9)
  ✓ Attendance recording (5/5)
  ✓ Self-service portal (employee role) (9/10, 1 expected: TOTP 404)
  ✓ Branding check (7/8, 1 expected: TOTP 404)
```

## Coverage Gaps

These areas could not be tested offline (require running `wrangler dev`):

1. **Gumroad sale → license → email flow** — HMAC webhook requires real server.
2. **Admin issue/extend/revoke → offline verify in rhumint-hrms** — full end-to-end.
3. **Version bump → manifest update → heartbeat** — CI pipeline integration.
4. **Rate limiting** — 429 on rapid requests to validate/webhook.
5. **Anomaly detection** — 20+ failures from one org triggers alert.

**Recommendation:** Test these manually with wrangler dev on a non-Windows environment
or via Cloudflare Preview deployment before production go-live.
