# ADR 0004 — Cloudflare Email Sending over transactional email providers

**Date:** 2026-07-09
**Status:** Accepted

## Context

After a Gumroad purchase, the central API needs to send the customer their license key.
Options:

1. **SendGrid** — 100 emails/day on free tier. Requires API key management, HTTP API integration.
2. **Resend** — 3,000 emails/month on free tier, 100/day sending limit. SDK dependency.
3. **Cloudflare Email Sending** — 2,000 emails/day on free tier. Native Workers binding — no HTTP calls, no API keys, no SDK.

## Decision

Use Cloudflare Email Sending (Workers `send_email` binding).

## Consequences

**Positive:**
- 2,000 emails/day free tier — 20x SendGrid's free tier and more generous than Resend's daily limit.
- Native Workers binding — no HTTP round-trip, no API key management, no SDK dependency.
- Keeps all infrastructure within Cloudflare — no third-party vendor to monitor.

**Negative:**
- Requires domain onboarding: `npx wrangler email sending enable <domain>` and DNS verification (TXT + MX records). This is a one-time Cloudflare setup step.
- No built-in templating engine — email body is constructed as a string (sufficient for plain-text license delivery).
- No delivery analytics beyond Cloudflare's console logs.
