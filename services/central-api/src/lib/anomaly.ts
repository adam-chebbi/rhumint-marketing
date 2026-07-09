export interface ValidationEvent {
  license_id: string | null;
  org_id: string | null;
  success: boolean;
  ip: string;
  error?: string;
}

export async function logValidationEvent(db: D1Database, event: ValidationEvent): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (id, event_type, org_id, license_id, ip, details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      event.success ? "validate_success" : "validate_failure",
      event.org_id,
      event.license_id,
      event.ip,
      JSON.stringify({ error: event.error }),
      new Date().toISOString(),
    )
    .run();

  if (!event.success && event.org_id) {
    await checkValidationAnomaly(db, event.org_id);
  }
}

async function checkValidationAnomaly(db: D1Database, orgId: string): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 3600000).toISOString();

  const result = await db
    .prepare(
      "SELECT COUNT(*) as count FROM audit_log WHERE org_id = ? AND event_type = 'validate_failure' AND created_at > ?",
    )
    .bind(orgId, oneHourAgo)
    .first<{ count: number }>();

  if (result && result.count >= 20) {
    console.warn(`[ANOMALY] High validation failure rate for org ${orgId}: ${result.count} failures in last hour`);

    await db
      .prepare(
        "INSERT INTO audit_log (id, event_type, org_id, details, created_at) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        "anomaly_alert",
        orgId,
        JSON.stringify({ failures_last_hour: result.count, threshold: 20 }),
        new Date().toISOString(),
      )
      .run();
  }
}
