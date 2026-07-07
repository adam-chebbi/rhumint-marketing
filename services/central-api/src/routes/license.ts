import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getPrivateKey } from "../lib/config";
import { signToken } from "../lib/crypto";
import { createLicense, getLicense, revokeLicense, listLicenses } from "../lib/db";

const app = new Hono<{ Bindings: Env }>();

app.get("/", async (c) => {
  const licenses = await listLicenses(c.env.DB);
  return c.json({ licenses });
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
  });
});

app.post("/issue", async (c) => {
  const body = await c.req.json<{
    org_id: string;
    seats: number;
    modules?: string[];
    expires_at?: string | null;
    gumroad_sale_id?: string;
    customer_email?: string;
  }>();

  if (!body.org_id || !body.seats) {
    return c.json({ error: "org_id and seats are required" }, 400);
  }

  const licenseId = crypto.randomUUID();
  const now = new Date();
  const payload = {
    license_id: licenseId,
    org_id: body.org_id,
    issued_at: Math.floor(now.getTime() / 1000),
    expires_at: body.expires_at ? Math.floor(new Date(body.expires_at).getTime() / 1000) : null,
    seats: body.seats,
    modules: body.modules ?? ["core"],
  };

  const token = await signToken(payload, getPrivateKey(c.env));

  await createLicense(c.env.DB, {
    id: licenseId,
    gumroad_sale_id: body.gumroad_sale_id ?? null,
    customer_email: body.customer_email ?? null,
    org_id: body.org_id,
    seats: body.seats,
    modules: JSON.stringify(payload.modules),
    issued_at: now.toISOString(),
    expires_at: body.expires_at ?? null,
    revoked_at: null,
    created_at: now.toISOString(),
  });

  return c.json({ license_id: licenseId, token }, 201);
});

app.post("/validate", async (c) => {
  const body = await c.req.json<{ token?: string }>();
  if (!body.token) return c.json({ error: "token is required" }, 400);

  const parts = body.token.split(".");
  if (parts.length !== 2) return c.json({ valid: false, error: "Malformed token" }, 400);

  let payloadRaw: string;
  try {
    payloadRaw = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
  } catch {
    return c.json({ valid: false, error: "Invalid base64url encoding" }, 400);
  }

  let payload: { license_id: string };
  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    return c.json({ valid: false, error: "Invalid JSON payload" }, 400);
  }

  const license = await getLicense(c.env.DB, payload.license_id);
  if (!license) return c.json({ valid: false, error: "License not found" }, 404);

  if (license.revoked_at) {
    return c.json({ valid: false, error: "License revoked", revoked_at: license.revoked_at }, 403);
  }

  if (license.expires_at && new Date(license.expires_at) < new Date()) {
    return c.json({ valid: false, error: "License expired", expires_at: license.expires_at }, 403);
  }

  return c.json({ valid: true, license_id: license.id, org_id: license.org_id, seats: license.seats });
});

app.post("/:id/revoke", async (c) => {
  const ok = await revokeLicense(c.env.DB, c.req.param("id"));
  if (!ok) return c.json({ error: "License not found or already revoked" }, 404);
  return c.json({ success: true });
});

export default app;
