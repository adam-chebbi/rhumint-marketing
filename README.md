# Rhumint Marketing

Public marketing site + product-owner admin panel for Rhumint HRMS.

**Purpose:** Drives sales, manages licenses, and provides the product-owner control panel. Not a part of the HRMS product — customers never interact with this site.

**Tech stack:** Next.js on Cloudflare Pages. Cloudflare Workers + D1 for the central license/update/sales API. Gumroad for payment processing.

**Release cycle:** Independent from `rhumint-hrms`. Deploys on its own schedule via Cloudflare Pages Git integration. Zero shared code between the two repos — no submodules, no cross-imports.

**What lives here:**
- Marketing pages (landing, features, pricing, docs)
- Product-owner admin panel (sales dashboard, license management, Gumroad sync)
- Central API (license issue/validate/revoke, update manifest, Gumroad webhook receiver)
