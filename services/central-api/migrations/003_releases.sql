CREATE TABLE IF NOT EXISTS releases (
  id         TEXT PRIMARY KEY,
  version    TEXT UNIQUE NOT NULL,
  published_at TEXT NOT NULL,
  changelog  TEXT NOT NULL DEFAULT '',
  docker_tag TEXT NOT NULL,
  min_upgradable_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_releases_version ON releases(version);
