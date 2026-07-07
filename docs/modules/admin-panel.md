# Admin Panel

Single-user admin UI for product-owner operations. Lives in `site/` as a Next.js 14 App Router application deployed to Cloudflare Pages.

## Scope

This panel is for **product-owner use only** — the person building and selling Rhumint. It authenticates only the admin user via a shared password.

**In scope:**
- Sales dashboard: revenue totals, monthly revenue bars, purchase history synced from Gumroad
- License management: search licenses by org/email/ID, view status, manually issue, extend, or revoke
- Token display with copy-to-clipboard for support cases

**Out of scope (current MVP):**
- Multi-user auth (no client login, no reseller portal, no SSO)
- Role-based access control (admin is the only role)
- Self-service license portal for end customers
- Usage analytics or seat utilization tracking

## Authentication

Single-password auth with HMAC-signed session cookie:

1. Admin visits `/login` and enters `ADMIN_PASSWORD`
2. Server verifies password, creates a session token: `base64({exp}).base64(HMAC-SHA256(payload, password))`
3. Cookie `session` set with 24-hour expiry, `httpOnly`, `secure` in production
4. Next.js middleware verifies the cookie on every protected route request
5. If invalid or expired, redirects to `/login` and clears the cookie

**Environment variable:** `ADMIN_PASSWORD` — set in Cloudflare Pages environment.

## Central API Integration

The admin panel is the consumer of the Central API's admin-protected endpoints. All API calls are proxied server-side:

| Admin Panel | Central API Endpoint | Auth |
|---|---|---|
| Dashboard stats | `GET /api/admin/stats` | `Authorization: Bearer <CENTRAL_API_KEY>` |
| Purchase history | `GET /api/admin/purchases` | Same |
| License list | `GET /api/license` | Same |
| License detail | `GET /api/license/:id` | Same |
| Issue license | `POST /api/license/issue` | Same |
| Revoke license | `POST /api/license/:id/revoke` | Same |
| Extend license | `POST /api/license/:id/extend` | Same |

**Environment variables:**
- `CENTRAL_API_URL` — base URL of the Central API Worker (e.g., `https://central.rhumint.com`)
- `CENTRAL_API_KEY` — must match `ADMIN_API_KEY` set as a Central API Worker secret

## Pages

### `/dashboard` — Sales Dashboard

- **4 stat cards**: Total Revenue, Active Licenses, Total Purchases, Refunded count
- **Revenue bar chart**: Monthly revenue series from non-refunded purchases, computed server-side via SQL `GROUP BY strftime('%Y-%m', created_at)`
- **Recent purchases table**: Last 20 purchases synced from Gumroad, showing email, product, amount, status (Active/Refunded/Disputed), date

### `/licenses` — License Management

- **Search input**: Filters licenses client-side by org_id, customer_email, or license ID
- **Results table**: Org, Email, Seats, Modules, Status (Active/Expired/Revoked), Issued date, View link
- **Issue License button**: Opens modal form:
  - Org ID (required)
  - Customer Email (optional)
  - Seats (required, min 1)
  - Modules (multi-select toggle: core, hr, payroll, attendance, leave)
  - Expiry date (optional, blank = lifetime)
  - On submit: calls `POST /api/license/issue`, shows result with token + copy button

### `/licenses/[id]` — License Detail

- **Metadata panel**: License ID, Org ID, Email, Seats, Modules, Issued/Expires/Revoked timestamps, Gumroad sale ID
- **Status badge**: Active or Inactive
- **Actions panel** (only when license is active):
  - **Extend**: Toggles a date input. Submitting calls `POST /api/license/:id/extend`, updates expiry, copies new token to clipboard
  - **Revoke**: Confirmation dialog, then `POST /api/license/:id/revoke`

## Environment Variables

| Variable | Where | Description |
|---|---|---|
| `ADMIN_PASSWORD` | Pages env | Login password for admin panel |
| `CENTRAL_API_URL` | Pages env | Central API Worker URL |
| `CENTRAL_API_KEY` | Pages env | Must match central API's `ADMIN_API_KEY` |

## Local Development

```bash
# 1. Start the central API (from services/central-api/)
npx wrangler dev

# 2. In another terminal, start the admin panel
cd site
cp .env.local.example .env.local
# Edit .env.local with your dev values

npm install
npm run dev
# Opens at http://localhost:3000
```

## Deployment

Deployed as a Cloudflare Pages application alongside the marketing site. The Cloudflare Pages build command is:

```bash
cd site && npm install && npm run build
```

Output directory: `out/`

The central API's `ADMIN_API_KEY` and the admin panel's `CENTRAL_API_KEY` must match — they are set independently in their respective Cloudflare dashboards.
