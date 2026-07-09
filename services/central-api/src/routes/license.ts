import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getPrivateKey } from "../lib/config";
import { signToken } from "../lib/crypto";
import { checkRateLimit, getClientIp } from "../lib/rate-limit";
import { logValidationEvent } from "../lib/anomaly";
import {
  createLicense,
  getLicense,
  revokeLicense,
  listLicenses,
  listRevokedLicenseIds,
  extendLicense,
} from "../lib/db";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const licenses = await listLicenses(c.env.DB);
  return c.json({ licenses });
});

app.post("/issue", async (c) => {
  const body = await c.req.json<{
    org_id: string;
    seats: number;
    modules?: string[];
    exp?: string | null;
    gumroad_sale_id?: string;
    customer_email?: string;
  }>();

  if (!body.org_id || !body.seats) {
    return c.json({ error: "org_id and seats are required" }, 400);
  }
  if (body.seats < 1) {
    return c.json({ error: "seats must be a positive integer" }, 400);
  }
  if (!body.modules || body.modules.length === 0) {
    return c.json({ error: "modules must be a non-empty array" }, 400);
  }

  const licenseId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const payload = {
    license_id: licenseId,
    org_id: body.org_id,
    iat: now,
    exp: body.exp ? Math.floor(new Date(body.exp).getTime() / 1000) : null,
    seats: body.seats,
    modules: body.modules,
  };

  const token = await signToken(payload, getPrivateKey(c.env));

  await createLicense(c.env.DB, {
    id: licenseId,
    gumroad_sale_id: body.gumroad_sale_id ?? null,
    customer_email: body.customer_email ?? null,
    org_id: body.org_id,
    seats: body.seats,
    modules: JSON.stringify(payload.modules),
    issued_at: new Date(now * 1000).toISOString(),
    expires_at: body.exp ?? null,
    revoked_at: null,
    created_at: new Date(now * 1000).toISOString(),
  });

  return c.json({ license_id: licenseId, token }, 201);
});

app.get("/revocations/list", async (c) => {
  const revoked = await listRevokedLicenseIds(c.env.DB);
  return c.json({
    count: revoked.length,
    revoked,
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Validate — rate limited + audit logged for anomaly detection
// ───────────────────────────────────────────────────────────────────────────

async function validateToken(c: any, token: string): Promise<Response> {
  const ip = getClientIp(c);
  const rl = await checkRateLimit(c.env.DB, ip, "validate", 30, 60);
  if (!rl.allowed) {
    return c.json({ valid: false, error: "Rate limit exceeded", retry_after: rl.retryAfter }, 429);
  }

  const parts = token.split(".");
  if (parts.length !== 2) {
    return c.json({ valid: false, error: "Malformed token: expected 2 dot-separated parts" }, 400);
  }

  let payloadRaw: string;
  try {
    const padded = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const mod = padded.length % 4;
    payloadRaw = atob(mod ? padded + "=".repeat(4 - mod) : padded);
  } catch {
    return c.json({ valid: false, error: "Invalid base64url encoding in token payload" }, 400);
  }

  let payload: { license_id?: string };
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return c.json({ valid: false, error: "Invalid JSON in token payload" }, 400);
  }

  if (!payload.license_id) {
    return c.json({ valid: false, error: "Token payload missing license_id" }, 400);
  }

  const license = await getLicense(c.env.DB, payload.license_id);
  if (!license) {
    await logValidationEvent(c.env.DB, { license_id: payload.license_id, org_id: null, success: false, ip, error: "License not found in registry" });
    return c.json({ valid: false, error: "License not found in registry" }, 404);
  }

  if (license.revoked_at) {
    await logValidationEvent(c.env.DB, { license_id: license.id, org_id: license.org_id, success: false, ip, error: "License revoked" });
    return c.json({ valid: false, error: "License has been revoked", license_id: license.id, revoked_at: license.revoked_at }, 403);
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    await logValidationEvent(c.env.DB, { license_id: license.id, org_id: license.org_id, success: false, ip, error: "License expired" });
    return c.json({ valid: false, error: "License has expired", license_id: license.id, expires_at: license.expires_at }, 403);
  }

  await logValidationEvent(c.env.DB, { license_id: license.id, org_id: license.org_id, success: true, ip });
  return c.json({ valid: true, license_id: license.id, org_id: license.org_id, seats: license.seats, modules: JSON.parse(license.modules) });
}

app.get("/validate", async (c) => {
  const token = c.req.query("token");
  if (!token) return c.json({ error: "token query parameter is required" }, 400);
  return validateToken(c, token);
});

app.post("/validate", async (c) => {
  const body = await c.req.json<{ token?: string }>();
  if (!body.token) return c.json({ error: "token is required" }, 400);
  return validateToken(c, body.token);
});

app.get("/:id", async (c) => {
  const license = await getLicense(c.env.DB, c.req.param("id"));
  if (!license) return c.json({ error: "License not found" }, 404);
  return c.json({
    id: license.id,
    org_id: license.org_id,
    seats: license.seats,
    modules: JSON.parse(license.modules),
    issued_at: license.issued_at,
    expires_at: license.expires_at,
    revoked_at: license.revoked_at,
    gumroad_sale_id: license.gumroad_sale_id,
    customer_email: license.customer_email,
    created_at: license.created_at,
  });
});

app.post("/:id/revoke", async (c) => {
  const ok = await revokeLicense(c.env.DB, c.req.param("id"));
  if (!ok) return c.json({ error: "License not found or already revoked" }, 404);
  return c.json({ success: true });
});

app.post("/:id/extend", async (c) => {
  const { id } = c.req.param();
  const license = await getLicense(c.env.DB, id);
  if (!license) return c.json({ error: "License not found" }, 404);

  const body = await c.req.json<{ expires_at: string | null }>();
  const newExp = body.expires_at ?? null;

  if (newExp !== null && isNaN(Date.parse(newExp))) {
    return c.json({ error: "Invalid expires_at date format" }, 400);
  }

  const ok = await extendLicense(c.env.DB, id, newExp);
  if (!ok) return c.json({ error: "Failed to update license" }, 500);

  const payload = {
    license_id: license.id,
    org_id: license.org_id,
    iat: Math.floor(Date.now() / 1000),
    exp: newExp ? Math.floor(new Date(newExp).getTime() / 1000) : null,
    seats: license.seats,
    modules: JSON.parse(license.modules),
  };
  const token = await signToken(payload, getPrivateKey(c.env));

  return c.json({ success: true, token, expires_at: newExp });
});

app.post("/heartbeat", async (c) => {
  const body = await c.req.json<{ token: string; version: string }>();
  if (!body.token || !body.version) {
    return c.json({ error: "token and version are required" }, 400);
  }

  const parts = body.token.split(".");
  if (parts.length !== 2) {
    return c.json({ error: "Malformed token" }, 400);
  }

  let payloadRaw: string;
  try {
    const padded = parts[0].replace(/-/g, "+").replace(/_/g, "/");
    const mod = padded.length % 4;
    payloadRaw = atob(mod ? padded + "=".repeat(4 - mod) : padded);
  } catch {
    return c.json({ error: "Invalid base64url encoding" }, 400);
  }

  let payload: { license_id?: string; org_id?: string };
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return c.json({ error: "Invalid JSON in token payload" }, 400);
  }

  if (!payload.license_id || !payload.org_id) {
    return c.json({ error: "Token missing license_id or org_id" }, 400);
  }

  const license = await getLicense(c.env.DB, payload.license_id);
  if (!license) {
    return c.json({ error: "License not found" }, 404);
  }
  if (license.revoked_at) {
    return c.json({ error: "License revoked" }, 403);
  }

  const { recordHeartbeat } = await import("../lib/db");
  await recordHeartbeat(c.env.DB, {
    id: crypto.randomUUID(),
    license_id: payload.license_id,
    org_id: payload.org_id,
    version: body.version,
    created_at: new Date().toISOString(),
  });

  return c.json({ success: true });
});

export default app;
