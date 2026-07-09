# ADR 0002 — Ed25519 for offline license tokens

**Date:** 2026-07-09
**Status:** Accepted

## Context

Rhumint licenses must be verifiable **offline** — the self-hosted HRMS app may not have
network access to the central API at all times. The token needs authentication (proves the
central API issued it) and integrity (proves it hasn't been tampered with).

Options considered:
1. **RSA-2048** — Industry standard, but keys are large, signatures are ~256 bytes, and verification is slow.
2. **ECDSA (P-256)** — Smaller keys and signatures than RSA, but signing requires a reliable entropy source and the algorithm is more complex.
3. **Ed25519** — Modern Edwards-curve Digital Signature Algorithm: 32-byte public keys, 64-byte signatures, fast constant-time verification, and native support in Cloudflare Workers (Web Crypto API).

## Decision

Use Ed25519 for license token signing and verification.

## Consequences

**Positive:**
- 32-byte public key (easily embedded in rhumint-hrms at build time, or included in Docker images).
- 64-byte signatures — tokens are small enough to pass as URL query params or QR codes.
- Fast constant-time verification — no timing side-channels.
- Native Cloudflare Workers support via `crypto.subtle.sign()` / `verify()` with `Ed25519` algorithm.
- Python support via `cryptography` library (used in rhumint-hrms for verification).

**Negative:**
- Some older Python environments may need an updated `cryptography` package (35.0+).
- Not FIPS-compliant (irrelevant for this use case — no government customer requirement).
