import type { License, Purchase, Release, Ticket, Heartbeat } from "../types";

// ── Licenses ──────────────────────────────────────────────────────────────

export async function createLicense(db: D1Database, license: License): Promise<void> {
  const { id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at } = license;
  await db
    .prepare(
      `INSERT INTO licenses (id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at)
    .run();
}

export async function getLicense(db: D1Database, licenseId: string): Promise<License | null> {
  const result = await db
    .prepare("SELECT * FROM licenses WHERE id = ?")
    .bind(licenseId)
    .first<License>();
  return result || null;
}

export async function revokeLicense(db: D1Database, licenseId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE licenses SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), licenseId)
    .run();
  return result.meta.changes > 0;
}

export async function revokeLicenseBySaleId(db: D1Database, saleId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE licenses SET revoked_at = ? WHERE gumroad_sale_id = ? AND revoked_at IS NULL")
    .bind(new Date().toISOString(), saleId)
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

export async function getLicenseBySaleId(db: D1Database, saleId: string): Promise<License | null> {
  const result = await db
    .prepare("SELECT * FROM licenses WHERE gumroad_sale_id = ?")
    .bind(saleId)
    .first<License>();
  return result || null;
}

// ── Purchases ─────────────────────────────────────────────────────────────

export async function createPurchase(db: D1Database, purchase: Purchase): Promise<void> {
  const { id, gumroad_sale_id, email, product_name, product_id, amount_cents, currency, is_gift, event_type, license_id } = purchase;
  await db
    .prepare(
      `INSERT INTO purchases (id, gumroad_sale_id, email, product_name, product_id, amount_cents, currency, is_gift, event_type, license_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, gumroad_sale_id, email, product_name, product_id, amount_cents, currency, is_gift, event_type, license_id)
    .run();
}

export async function getPurchaseBySaleId(db: D1Database, saleId: string): Promise<Purchase | null> {
  const result = await db
    .prepare("SELECT * FROM purchases WHERE gumroad_sale_id = ?")
    .bind(saleId)
    .first<Purchase>();
  return result || null;
}

export async function markPurchaseRefunded(db: D1Database, saleId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE purchases SET refunded_at = ? WHERE gumroad_sale_id = ? AND refunded_at IS NULL")
    .bind(new Date().toISOString(), saleId)
    .run();
  return result.meta.changes > 0;
}

export async function markPurchaseDisputed(db: D1Database, saleId: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE purchases SET disputed_at = ? WHERE gumroad_sale_id = ? AND disputed_at IS NULL")
    .bind(new Date().toISOString(), saleId)
    .run();
  return result.meta.changes > 0;
}

export async function linkPurchaseToLicense(db: D1Database, saleId: string, licenseId: string): Promise<void> {
  await db
    .prepare("UPDATE purchases SET license_id = ? WHERE gumroad_sale_id = ?")
    .bind(licenseId, saleId)
    .run();
}

// ── Admin ─────────────────────────────────────────────────────────────────

export interface PurchaseWithLicense {
  id: string;
  gumroad_sale_id: string;
  email: string;
  product_name: string;
  product_id: string;
  amount_cents: number;
  currency: string;
  is_gift: number;
  event_type: string;
  license_id: string | null;
  refunded_at: string | null;
  disputed_at: string | null;
  created_at: string;
  org_id: string | null;
  seats: number | null;
  modules: string | null;
  license_revoked_at: string | null;
}

export async function listPurchases(db: D1Database): Promise<PurchaseWithLicense[]> {
  return (await db
    .prepare(
      `SELECT p.*, l.org_id, l.seats, l.modules, l.revoked_at AS license_revoked_at
       FROM purchases p
       LEFT JOIN licenses l ON p.license_id = l.id
       ORDER BY p.created_at DESC`,
    )
    .all<PurchaseWithLicense>()).results;
}

export interface AdminStats {
  total_revenue: number;
  total_purchases: number;
  refunded_count: number;
  disputed_count: number;
  active_licenses: number;
  revoked_licenses: number;
  revenue_series: { month: string; revenue: number }[];
}

export async function getAdminStats(db: D1Database): Promise<AdminStats> {
  const revenueRow = await db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) / 100.0 AS total_revenue
       FROM purchases WHERE refunded_at IS NULL AND disputed_at IS NULL`,
    )
    .first<{ total_revenue: number }>();

  const countsRow = await db
    .prepare(
      `SELECT
         COUNT(*) AS total_purchases,
         SUM(CASE WHEN refunded_at IS NOT NULL THEN 1 ELSE 0 END) AS refunded_count,
         SUM(CASE WHEN disputed_at IS NOT NULL THEN 1 ELSE 0 END) AS disputed_count
       FROM purchases`,
    )
    .first<{ total_purchases: number; refunded_count: number; disputed_count: number }>();

  const licenseCountsRow = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN revoked_at IS NULL THEN 1 ELSE 0 END) AS active_licenses,
         SUM(CASE WHEN revoked_at IS NOT NULL THEN 1 ELSE 0 END) AS revoked_licenses
       FROM licenses`,
    )
    .first<{ active_licenses: number; revoked_licenses: number }>();

  const series = (await db
    .prepare(
      `SELECT strftime('%Y-%m', created_at) AS month, SUM(amount_cents) / 100.0 AS revenue
       FROM purchases WHERE refunded_at IS NULL AND disputed_at IS NULL
       GROUP BY month ORDER BY month ASC`,
    )
    .all<{ month: string; revenue: number }>()).results;

  return {
    total_revenue: revenueRow?.total_revenue ?? 0,
    total_purchases: countsRow?.total_purchases ?? 0,
    refunded_count: countsRow?.refunded_count ?? 0,
    disputed_count: countsRow?.disputed_count ?? 0,
    active_licenses: licenseCountsRow?.active_licenses ?? 0,
    revoked_licenses: licenseCountsRow?.revoked_licenses ?? 0,
    revenue_series: series ?? [],
  };
}

export async function extendLicense(
  db: D1Database,
  licenseId: string,
  expiresAt: string | null,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE licenses SET expires_at = ? WHERE id = ?")
    .bind(expiresAt, licenseId)
    .run();
  return result.meta.changes > 0;
}

// ── Tickets ───────────────────────────────────────────────────────────────

export async function listTickets(db: D1Database): Promise<Ticket[]> {
  return (await db
    .prepare("SELECT * FROM tickets ORDER BY created_at DESC")
    .all<Ticket>()).results;
}

export async function createTicket(db: D1Database, ticket: Ticket): Promise<void> {
  const { id, org_id, contact_email, subject, description, status, priority, created_at } = ticket;
  await db
    .prepare(
      `INSERT INTO tickets (id, org_id, contact_email, subject, description, status, priority, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, org_id, contact_email, subject, description, status, priority, created_at)
    .run();
}

export async function closeTicket(db: D1Database, id: string): Promise<boolean> {
  const result = await db
    .prepare("UPDATE tickets SET status = 'closed', closed_at = ? WHERE id = ? AND status = 'open'")
    .bind(new Date().toISOString(), id)
    .run();
  return result.meta.changes > 0;
}

// ── Heartbeats ────────────────────────────────────────────────────────────

export async function recordHeartbeat(db: D1Database, hb: Heartbeat): Promise<void> {
  const { id, license_id, org_id, version, created_at } = hb;
  await db
    .prepare("INSERT INTO heartbeats (id, license_id, org_id, version, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, license_id, org_id, version, created_at)
    .run();
}

export async function getLatestHeartbeats(db: D1Database): Promise<Heartbeat[]> {
  return (await db
    .prepare(
      `SELECT h.* FROM heartbeats h
       WHERE h.created_at = (
         SELECT MAX(created_at) FROM heartbeats h2 WHERE h2.org_id = h.org_id
       )
       ORDER BY h.created_at DESC`,
    )
    .all<Heartbeat>()).results;
}

// ── Releases ──────────────────────────────────────────────────────────────

export async function createRelease(db: D1Database, release: Release): Promise<void> {
  const { id, version, published_at, changelog, docker_tag, min_upgradable_version } = release;
  await db
    .prepare(
      `INSERT INTO releases (id, version, published_at, changelog, docker_tag, min_upgradable_version)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, version, published_at, changelog, docker_tag, min_upgradable_version)
    .run();
}

export async function getLatestRelease(db: D1Database): Promise<Release | null> {
  const result = await db
    .prepare("SELECT * FROM releases ORDER BY published_at DESC LIMIT 1")
    .first<Release>();
  return result || null;
}

export async function getReleaseByVersion(db: D1Database, version: string): Promise<Release | null> {
  const result = await db
    .prepare("SELECT * FROM releases WHERE version = ?")
    .bind(version)
    .first<Release>();
  return result || null;
}

export async function listReleases(db: D1Database): Promise<Release[]> {
  return (await db
    .prepare("SELECT * FROM releases ORDER BY published_at DESC")
    .all<Release>()).results;
}
