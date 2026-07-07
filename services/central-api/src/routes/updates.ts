import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getLatestRelease, getReleaseByVersion, createRelease, listReleases } from "../lib/db";
import type { Release } from "../types";

// ── Semver helpers ────────────────────────────────────────────────────────

function parseVersion(v: string): number[] {
  return v.replace(/^v/, "").split(".").map((n) => {
    const i = parseInt(n, 10);
    return isNaN(i) ? 0 : i;
  });
}

function isNewerThan(a: string, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na > nb;
  }
  return false;
}

function satisfiesMin(current: string, min: string): boolean {
  return !isNewerThan(min, current);
}

const app = new Hono<{ Bindings: Env }>();

// ───────────────────────────────────────────────────────────────────────────
// GET /api/updates/manifest — check for updates
// Client calls with its current_version to learn whether a newer version exists.
// ───────────────────────────────────────────────────────────────────────────

app.get("/manifest", async (c) => {
  const currentVersion = c.req.query("current_version");

  const latest = await getLatestRelease(c.env.DB);
  if (!latest) {
    return c.json({
      latest_version: "0.0.0",
      current_version: currentVersion ?? "0.0.0",
      update_available: false,
      published_at: null,
      changelog: "No releases published yet.",
      docker_tag: null,
      min_upgradable_version: null,
    });
  }

  let updateAvailable = false;
  let blocked = false;
  let reason: string | null = null;

  if (currentVersion) {
    if (isNewerThan(latest.version, currentVersion)) {
      updateAvailable = true;
      if (!satisfiesMin(currentVersion, latest.min_upgradable_version)) {
        blocked = true;
        reason = `Upgrade path requires version ${latest.min_upgradable_version} or newer. Current version ${currentVersion} must be upgraded incrementally first.`;
      }
    }
  }

  return c.json({
    latest_version: latest.version,
    current_version: currentVersion ?? null,
    update_available: updateAvailable,
    blocked,
    reason,
    published_at: latest.published_at,
    changelog: latest.changelog,
    docker_tag: latest.docker_tag,
    min_upgradable_version: latest.min_upgradable_version,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/updates/releases — list all published releases (admin use)
// ───────────────────────────────────────────────────────────────────────────

app.get("/releases", async (c) => {
  const releases = await listReleases(c.env.DB);
  return c.json({ releases });
});

// ───────────────────────────────────────────────────────────────────────────
// GET /api/updates/releases/:version — get a specific release
// ───────────────────────────────────────────────────────────────────────────

app.get("/releases/:version", async (c) => {
  const release = await getReleaseByVersion(c.env.DB, c.req.param("version"));
  if (!release) return c.json({ error: "Release not found" }, 404);
  return c.json(release);
});

// ───────────────────────────────────────────────────────────────────────────
// POST /api/updates/publish — publish a new release
// Called by the rhumint-hrms CI pipeline on tagged releases.
// Authenticated via RELEASE_API_KEY secret.
// ───────────────────────────────────────────────────────────────────────────

app.post("/publish", async (c) => {
  // ── Authenticate ─────────────────────────────────────────────────
  const authKey = c.env.RELEASE_API_KEY;
  if (authKey) {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token || token !== authKey) {
      return c.json({ error: "Invalid or missing release API key" }, 401);
    }
  }

  const body = await c.req.json<{
    version: string;
    changelog?: string;
    docker_tag: string;
    min_upgradable_version?: string;
  }>();

  if (!body.version || !body.docker_tag) {
    return c.json({ error: "version and docker_tag are required" }, 400);
  }
  if (!/^\d+\.\d+\.\d+$/.test(body.version)) {
    return c.json({ error: "version must be in semver format (e.g. 0.2.0)" }, 400);
  }

  // ── Check for duplicate ──────────────────────────────────────────
  const existing = await getReleaseByVersion(c.env.DB, body.version);
  if (existing) {
    return c.json({ message: "Release already published", release: existing });
  }

  const release: Release = {
    id: crypto.randomUUID(),
    version: body.version,
    published_at: new Date().toISOString(),
    changelog: body.changelog ?? "",
    docker_tag: body.docker_tag,
    min_upgradable_version: body.min_upgradable_version ?? body.version,
    created_at: new Date().toISOString(),
  };

  try {
    await createRelease(c.env.DB, release);
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE constraint")) {
      return c.json({ message: "Release already published (race)" });
    }
    console.error("Failed to publish release:", err);
    return c.json({ error: "Internal error publishing release" }, 500);
  }

  return c.json({ success: true, release }, 201);
});

export default app;
