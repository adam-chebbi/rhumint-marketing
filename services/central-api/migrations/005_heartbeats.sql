CREATE TABLE IF NOT EXISTS heartbeats (
  id         TEXT PRIMARY KEY,
  license_id TEXT NOT NULL,
  org_id     TEXT NOT NULL,
  version    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_heartbeats_org ON heartbeats(org_id, created_at);
CREATE INDEX idx_heartbeats_license ON heartbeats(license_id);
