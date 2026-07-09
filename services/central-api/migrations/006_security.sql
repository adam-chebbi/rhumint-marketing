CREATE TABLE IF NOT EXISTS rate_limits (
  ip        TEXT NOT NULL,
  route     TEXT NOT NULL,
  window_ts INTEGER NOT NULL,
  count     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (ip, route, window_ts)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id         TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  org_id     TEXT,
  license_id TEXT,
  ip         TEXT,
  details    TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_audit_org_event ON audit_log(org_id, event_type, created_at);
CREATE INDEX idx_audit_type ON audit_log(event_type, created_at);
