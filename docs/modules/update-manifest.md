# Update Manifest

The central API provides version-manifest and release-publishing endpoints so that `rhumint-hrms` instances can poll for available updates and the `rhumint-hrms` CI pipeline can publish new releases.

## Endpoints

### `GET /api/updates/manifest?current_version=0.1.0`

**Purpose** — called periodically by the rhumint-hrms admin panel (or on-demand via a "Check for Updates" button). Returns whether a newer version exists and whether the client's version can upgrade directly.

**Response** `200 OK`

```json
{
  "latest_version": "0.2.0",
  "current_version": "0.1.0",
  "update_available": true,
  "blocked": false,
  "reason": null,
  "published_at": "2026-08-01T00:00:00Z",
  "changelog": "### Added\n- Payroll module\n- Performance reviews",
  "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.2.0",
  "min_upgradable_version": "0.1.0"
}
```

Fields:

| Field | Type | Description |
|---|---|---|
| `latest_version` | string | Highest version in the releases table |
| `current_version` | string? | The version the client reported; `null` if omitted |
| `update_available` | bool | Whether a newer version exists that satisfies `min_upgradable_version` |
| `blocked` | bool | When `true`, the client's version is below `min_upgradable_version` and must upgrade incrementally first |
| `reason` | string? | Human-readable explanation when `blocked` |
| `published_at` | string? | ISO-8601 timestamp of the latest release |
| `changelog` | string | Markdown changelog of the latest release |
| `docker_tag` | string? | Docker image tag for the latest release |
| `min_upgradable_version` | string? | Minimum version that can upgrade directly to `latest_version` |

The client should not offer an upgrade when `blocked: true`. Users must install the minimum version first, then upgrade again to the latest.

### `GET /api/updates/releases`

**Purpose** — list all published releases (admin panel use).

**Response** `200 OK`

```json
{
  "releases": [
    {
      "id": "uuid",
      "version": "0.2.0",
      "published_at": "2026-08-01T00:00:00Z",
      "changelog": "### Added\n- Payroll",
      "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.2.0",
      "min_upgradable_version": "0.1.0",
      "created_at": "2026-08-01T00:00:01Z"
    }
  ]
}
```

### `GET /api/updates/releases/:version`

**Purpose** — get a specific release by version string.

**Response** `200 OK` (single release object) or `404`.

### `POST /api/updates/publish`

**Purpose** — called by the `rhumint-hrms` CI pipeline (e.g., on a `v0.2.0` tag push). Inserts a new release into the D1 database.

**Authentication** — Bearer token via `RELEASE_API_KEY` Worker secret. The CI sends `Authorization: Bearer <secret>`.

**Request**

```json
{
  "version": "0.2.0",
  "changelog": "### Added\n- Payroll module\n- Performance reviews",
  "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.2.0",
  "min_upgradable_version": "0.1.0"
}
```

| Field | Required | Description |
|---|---|---|
| `version` | yes | Semver (e.g. `0.2.0`). Must match `^\d+\.\d+\.\d+$` |
| `docker_tag` | yes | Full container image tag |
| `changelog` | no | Markdown changelog for this version |
| `min_upgradable_version` | no | Minimum version that can upgrade directly. Defaults to `version` if omitted (i.e. no incremental constraint) |

**Response** `201 Created`

```json
{
  "success": true,
  "release": { ... }
}
```

**Response** `400` — missing required fields or invalid semver.

**Response** `401` — missing or invalid API key.

## Client (rhumint-hrms) Integration

The rhumint-hrms admin panel should:

1. On page load (or on a "Check for Updates" button click): `GET /api/updates/manifest?current_version=X.Y.Z`
2. If `update_available: true` and `blocked: false`: show a banner with the changelog and a download/upgrade link pointing to the Docker tag.
3. If `blocked: true`: show a message explaining the incremental upgrade requirement and link to the intermediate version.
4. If `update_available: false`: display "You are on the latest version."

The actual upgrade flow remains client-side: pull the new Docker image, run Alembic migrations, restart. The central API does not push updates.

## CI Pipeline (rhumint-hrms) Integration

On a tagged release (e.g., `v0.2.0`), the CI pipeline should:

1. Create a Docker image tagged with the semver.
2. Push the image to the container registry.
3. `POST /api/updates/publish` with the version, docker_tag, and changelog.
4. Use `RELEASE_API_KEY` stored as a GitHub Actions secret.

Example `curl` from CI:

```bash
curl -X POST https://central.rhumint.com/api/updates/publish \
  -H "Authorization: Bearer $RELEASE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "version": "0.2.0",
    "changelog": "### Added\n- Payroll module",
    "docker_tag": "ghcr.io/adam-chebbi/rhumint-hrms:0.2.0",
    "min_upgradable_version": "0.1.0"
  }'
```

## Data Model

```sql
CREATE TABLE releases (
  id         TEXT PRIMARY KEY,
  version    TEXT UNIQUE NOT NULL,
  published_at TEXT NOT NULL,
  changelog  TEXT NOT NULL DEFAULT '',
  docker_tag TEXT NOT NULL,
  min_upgradable_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

## Seed Data

The initial release (`0.1.0`) should be seeded into D1 when the database is first provisioned, so the manifest endpoint never returns "no releases published yet" for a running system:

```sql
INSERT INTO releases (id, version, published_at, changelog, docker_tag, min_upgradable_version)
VALUES (
  'seed-001',
  '0.1.0',
  '2026-04-15T00:00:00Z',
  '### Added\n- Initial MVP release\n- Employee management\n- Leave workflow\n- Daily-status attendance\n- Dress code / remote work branding',
  'ghcr.io/adam-chebbi/rhumint-hrms:0.1.0',
  '0.1.0'
);
```
