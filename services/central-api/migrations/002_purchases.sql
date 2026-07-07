CREATE TABLE IF NOT EXISTS purchases (
  id            TEXT PRIMARY KEY,
  gumroad_sale_id TEXT UNIQUE NOT NULL,
  email         TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'USD',
  is_gift       INTEGER NOT NULL DEFAULT 0,
  event_type    TEXT NOT NULL DEFAULT 'sale',
  license_id    TEXT,
  refunded_at   TEXT,
  disputed_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_purchases_gumroad_sale ON purchases(gumroad_sale_id);
CREATE INDEX idx_purchases_email ON purchases(email);
CREATE INDEX idx_purchases_license ON purchases(license_id);
