# ADR 0003 — Raw body HMAC for Gumroad webhook verification

**Date:** 2026-07-09
**Status:** Accepted

## Context

Gumroad sends webhook payloads as `application/x-www-form-urlencoded` and signs them with
an HMAC-SHA256 of the **raw form-encoded body bytes**. The signature is delivered in the
`X-Gumroad-Signature` header.

A naive implementation would parse the form body first (into a dict), then re-serialize it
to verify the HMAC. But URL-encoded bodies have no guaranteed field order, and re-serialization
changes whitespace and ordering — the HMAC will not match.

## Decision

Read the raw `text/plain` body before any parsing. Compute HMAC-SHA256 on the raw bytes
using the Web Crypto API's `crypto.subtle.verify()` with `HMAC` algorithm. Only after
HMAC passes, parse the body for event routing.

In the Hono Worker, this means calling `c.req.text()` before `c.req.parseBody()`. The
raw form-encoded body from Gumroad is the canonical input; any parsing happens on a copy.

## Consequences

**Positive:**
- HMAC verification always matches Gumroad's signing — no false rejections from re-serialization.
- Constant-time comparison via Web Crypto API (no `===` string comparison).
- Simple architecture — no need for a custom serialization function that matches Gumroad's exactly.

**Negative:**
- The handler must read the body twice (once raw, once parsed), but for URL-encoded forms this is negligible.
- Any developer modifying this code must understand why it reads the body before parsing. The rationale is documented in `docs/modules/gumroad-sync.md`.
