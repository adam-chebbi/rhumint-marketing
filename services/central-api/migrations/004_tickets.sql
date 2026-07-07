CREATE TABLE IF NOT EXISTS tickets (
  id            TEXT PRIMARY KEY,
  org_id        TEXT,
  contact_email TEXT,
  subject       TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'open',
  priority      TEXT NOT NULL DEFAULT 'normal',
  created_at    TEXT NOT NULL,
  closed_at     TEXT
);

CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_org ON tickets(org_id);
