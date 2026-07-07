CREATE TABLE IF NOT EXISTS licenses (
  id          TEXT PRIMARY KEY,
  gumroad_sale_id TEXT UNIQUE,
  customer_email  TEXT,
  org_id      TEXT NOT NULL,
  seats       INTEGER NOT NULL DEFAULT 1,
  modules     TEXT NOT NULL DEFAULT '["core"]',
  issued_at   TEXT NOT NULL,
  expires_at  TEXT,
  revoked_at  TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_licenses_gumroad_sale ON licenses(gumroad_sale_id);
CREATE INDEX idx_licenses_org ON licenses(org_id);
CREATE INDEX idx_licenses_revoked ON licenses(revoked_at);
