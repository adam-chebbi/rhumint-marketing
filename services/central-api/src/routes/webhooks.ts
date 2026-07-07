import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getPrivateKey } from "../lib/config";
import { signToken } from "../lib/crypto";
import { createLicense, getLicenseBySaleId } from "../lib/db";
import type { GumroadSale } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.post("/gumroad", async (c) => {
  const body = await c.req.parseBody<Record<string, string>>();

  const secret = c.env.GUMROAD_WEBHOOK_SECRET;
  if (secret) {
    const signature = c.req.header("X-Gumroad-Signature");
    if (!signature || signature !== secret) {
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  const sale: GumroadSale = {
    sale_id: body.sale_id || "",
    email: body.email || "",
    product_name: body.product_name || "",
    product_id: body.product_id || "",
    license_key: body.license_key || null,
    timestamp: body.timestamp || new Date().toISOString(),
    amount_cents: parseInt(body.amount_cents || "0", 10),
    currency: body.currency || "USD",
    is_gift: body.is_gift === "true",
  };

  if (!sale.sale_id) {
    return c.json({ error: "sale_id is required" }, 400);
  }

  const existing = await getLicenseBySaleId(c.env.DB, sale.sale_id);
  if (existing) {
    return c.json({ message: "Sale already processed", license_id: existing.id });
  }

  const licenseId = crypto.randomUUID();
  const now = new Date();

  const payload = {
    license_id: licenseId,
    org_id: `org-${sale.sale_id.slice(0, 8)}`,
    issued_at: Math.floor(now.getTime() / 1000),
    expires_at: null,
    seats: 50,
    modules: ["core"],
  };

  const token = await signToken(payload, getPrivateKey(c.env));

  await createLicense(c.env.DB, {
    id: licenseId,
    gumroad_sale_id: sale.sale_id,
    customer_email: sale.email,
    org_id: payload.org_id,
    seats: payload.seats,
    modules: JSON.stringify(payload.modules),
    issued_at: now.toISOString(),
    expires_at: null,
    revoked_at: null,
    created_at: now.toISOString(),
  });

  return c.json({ success: true, license_id: licenseId, token }, 201);
});

export default app;
