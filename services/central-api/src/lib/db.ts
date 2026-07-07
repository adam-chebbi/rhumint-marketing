import type { License } from "../types";

export async function createLicense(
  db: D1Database,
  license: License,
): Promise<void> {
  const { id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at } = license;
  await db
    .prepare(
      `INSERT INTO licenses (id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at)
    .run();
}

export async function getLicense(
  db: D1Database,
  licenseId: string,
): Promise<License | null> {
  const result = await db
    .prepare("SELECT * FROM licenses WHERE id = ?")
    .bind(licenseId)
    .first<License>();
  return result || null;
}

export async function revokeLicense(
  db: D1Database,
  licenseId: string,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE licenses SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), licenseId)
    .run();
  return result.meta.changes > 0;
}

export async function listLicenses(db: D1Database): Promise<License[]> {
  return (await db
    .prepare("SELECT * FROM licenses ORDER BY created_at DESC")
    .all<License>()).results;
}

export async function listRevokedLicenseIds(db: D1Database): Promise<{ license_id: string; revoked_at: string }[]> {
  return (await db
    .prepare("SELECT id AS license_id, revoked_at FROM licenses WHERE revoked_at IS NOT NULL ORDER BY revoked_at DESC")
    .all<{ license_id: string; revoked_at: string }>()).results;
}

export async function getLicenseBySaleId(
  db: D1Database,
  saleId: string,
): Promise<License | null> {
  const result = await db
    .prepare("SELECT * FROM licenses WHERE gumroad_sale_id = ?")
    .bind(saleId)
    .first<License>();
  return result || null;
}
