# ADR 0006 — Anomaly detection: logging-only, not auto-blocking

**Date:** 2026-07-09
**Status:** Accepted

## Context

Repeated validation failures could indicate a brute-force attempt, a misconfigured client,
or an honest user with a corrupted license file. We need to detect anomalies (high failure
rates) without punishing legitimate users.

Options:
1. **Auto-block** — Automatically revoke or temporarily disable licenses after N failures. High risk of false positives blocking real customers.
2. **Auto-block with escalation** — Block only after very high threshold (e.g., 100 failures/hour). Still risky for a small customer base.
3. **Logging-only with alert** — Log every failure, detect high failure rates, emit an alert, but take no automated action. Human reviews and decides.

## Decision

Use option 3: log every validation attempt to the `audit_log` table, track failure rate
per org per hour, and emit an `anomaly_alert` event (via `console.warn()` for Workers
console observability) when the rate exceeds 20 failures/hour/org.

## Consequences

**Positive:**
- Zero false positives — no legitimate customer is ever auto-blocked.
- Full forensic trail — every validation attempt is logged with timestamp, org_id, and outcome.
- Simple to evolve: the anomaly event can later drive a webhook, a support ticket, or an automated block once we have real-world data on false-positive rates.

**Negative:**
- Bad actors may continue hammering the validation endpoint until a human reviews the alert.
- `console.warn()` is visible in Workers console logs but not externally routable — the product owner must actively monitor logs.
