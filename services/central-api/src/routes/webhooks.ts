import { Hono } from "hono";
import type { Env } from "../lib/config";
import { getPrivateKey, getEmailFrom } from "../lib/config";
import { signToken } from "../lib/crypto";
import {
  createLicense,
  getLicenseBySaleId,
  revokeLicenseBySaleId,
  createPurchase,
  getPurchaseBySaleId,
  markPurchaseRefunded,
  markPurchaseDisputed,
  linkPurchaseToLicense,
} from "../lib/db";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

async function verifySignature(rawBody: string, secret: string, headerSig: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  try {
    const sigBytes = hexToBytes(headerSig);
    return await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(rawBody));
  } catch {
    return false;
  }
}

async function sendLicenseEmail(
  emailBinding: SendEmail,
  recipient: string,
  licenseToken: string,
  from: { email: string; name: string },
): Promise<void> {
  const subject = "Your Rhumint HRMS License Key";
  const text = `Thank you for purchasing Rhumint HRMS.

Your license token is:

${licenseToken}

SETUP INSTRUCTIONS
──────────────────
1. Deploy the Docker Compose bundle on your server.
2. During the initial onboarding wizard, enter the token above when prompted.
3. The system will verify the license offline and activate your instance.

For full deploy instructions, see:
  https://github.com/adam-chebbi/rhumint-hrms/blob/main/docs/deploy.md

For support, reply to this email.

─ The Rhumint Team`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #1a1a2e;">Your Rhumint HRMS License</h1>
  <p>Thank you for your purchase! Your license token is ready.</p>

  <div style="background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin: 20px 0; font-family: 'SFMono-Regular', Consolas, monospace; font-size: 13px; word-break: break-all;">
    ${licenseToken}
  </div>

  <h2 style="color: #1a1a2e;">Setup Instructions</h2>
  <ol style="line-height: 1.8;">
    <li>Deploy the Docker Compose bundle on your server.</li>
    <li>During the initial onboarding wizard, enter the token above when prompted.</li>
    <li>The system will verify the license offline and activate your instance.</li>
  </ol>

  <p style="margin-top: 24px;">
    <a href="https://github.com/adam-chebbi/rhumint-hrms/blob/main/docs/deploy.md"
       style="background: #1a1a2e; color: #fff; text-decoration: none; padding: 10px 20px; border-radius: 6px; display: inline-block;">
      View Full Deploy Guide
    </a>
  </p>

  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
  <p style="color: #666; font-size: 13px;">Need help? Reply to this email.</p>
</body>
</html>`;

  await emailBinding.send({
    to: recipient,
    from: { email: from.email, name: from.name },
    subject,
    text,
    html,
  });
}

const app = new Hono<{ Bindings: Env }>();

app.post("/gumroad", async (c) => {
  // ── 1. Read raw body for signature verification ─────────────────────
  const rawBody = await c.req.text();

  // ── 2. Verify HMAC-SHA256 signature ─────────────────────────────────
  const secret = c.env.GUMROAD_WEBHOOK_SECRET;
  if (secret) {
    const signature = c.req.header("X-Gumroad-Signature");
    if (!signature) {
      console.warn("Gumroad webhook: missing X-Gumroad-Signature header");
      return c.json({ error: "Missing X-Gumroad-Signature header" }, 401);
    }
    const valid = await verifySignature(rawBody, secret, signature);
    if (!valid) {
      console.warn("Gumroad webhook: signature mismatch");
      return c.json({ error: "Invalid signature" }, 401);
    }
  }

  // ── 3. Parse form-encoded body ─────────────────────────────────────
  const params = new URLSearchParams(rawBody);
  const getField = (name: string): string => params.get(name) ?? "";

  const event = getField("event");

  // Ping event — Gumroad sends this when configuring the webhook URL
  if (event === "ping") {
    return c.json({ success: true, message: "Webhook endpoint is live" });
  }

  const saleId = getField("sale_id");
  if (!saleId) {
    return c.json({ error: "sale_id is required" }, 400);
  }

  // ── 4. Route by event type ─────────────────────────────────────────
  switch (event) {
    case "sale":
      return handleSale(c, rawBody);
    case "refund":
      return handleRefund(c, saleId);
    case "dispute":
      return handleDispute(c, saleId);
    case "dispute_won":
      return handleDisputeWon(c, saleId);
    default:
      console.warn(`Gumroad webhook: unhandled event type "${event}"`);
      return c.json({ message: `Event "${event}" acknowledged but not processed` });
  }
});

// ── Sale handler ──────────────────────────────────────────────────────────

async function handleSale(c: any, rawBody: string): Promise<Response> {
  const params = new URLSearchParams(rawBody);
  const getField = (name: string): string => params.get(name) ?? "";

  const saleId = getField("sale_id");
  const email = getField("email");
  const productName = getField("product_name");
  const productId = getField("product_id");
  const amountCents = parseInt(getField("amount_cents") || "0", 10);
  const currency = getField("currency") || "USD";
  const isGift = getField("is_gift") === "true";

  // ── Deduplication ──────────────────────────────────────────────────
  const existingPurchase = await getPurchaseBySaleId(c.env.DB, saleId);
  if (existingPurchase) {
    console.log(`Gumroad sale ${saleId}: already processed (purchase exists)`);
    return c.json({ message: "Sale already processed", purchase_id: existingPurchase.id });
  }

  const existingLicense = await getLicenseBySaleId(c.env.DB, saleId);
  if (existingLicense) {
    console.log(`Gumroad sale ${saleId}: already processed (license exists)`);
    return c.json({ message: "Sale already processed", license_id: existingLicense.id });
  }

  // ── Create purchase record ─────────────────────────────────────────
  const purchaseId = crypto.randomUUID();
  const purchase = {
    id: purchaseId,
    gumroad_sale_id: saleId,
    email,
    product_name: productName,
    product_id: productId,
    amount_cents: amountCents,
    currency,
    is_gift: isGift ? 1 : 0,
    event_type: "sale",
    license_id: null,
    refunded_at: null,
    disputed_at: null,
    created_at: new Date().toISOString(),
  };

  // ── Issue license ──────────────────────────────────────────────────
  const licenseId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    license_id: licenseId,
    org_id: `org-${saleId.slice(0, 8)}`,
    iat: now,
    exp: null,
    seats: 50,
    modules: ["core"],
  };
  const token = await signToken(payload, getPrivateKey(c.env));

  const license = {
    id: licenseId,
    gumroad_sale_id: saleId,
    customer_email: email,
    org_id: payload.org_id,
    seats: payload.seats,
    modules: JSON.stringify(payload.modules),
    issued_at: new Date(now * 1000).toISOString(),
    expires_at: null,
    revoked_at: null,
    created_at: new Date(now * 1000).toISOString(),
  };

  purchase.license_id = licenseId;

  // ── Persist ────────────────────────────────────────────────────────
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO purchases (id, gumroad_sale_id, email, product_name, product_id, amount_cents, currency, is_gift, event_type, license_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(purchaseId, saleId, email, productName, productId, amountCents, currency, isGift ? 1 : 0, "sale", licenseId),

      c.env.DB.prepare(
        `INSERT INTO licenses (id, gumroad_sale_id, customer_email, org_id, seats, modules, issued_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(licenseId, saleId, email, payload.org_id, payload.seats, JSON.stringify(payload.modules), new Date(now * 1000).toISOString(), null),
    ]);
  } catch (err: any) {
    if (err?.message?.includes("UNIQUE constraint")) {
      console.log(`Gumroad sale ${saleId}: duplicate (race condition)`);
      return c.json({ message: "Sale already processed (concurrent request)" });
    }
    console.error(`Gumroad sale ${saleId}: DB write failed`, err);
    return c.json({ error: "Internal error processing sale" }, 500);
  }

  // ── Send delivery email (best-effort) ──────────────────────────────
  try {
    const from = getEmailFrom(c.env);
    await sendLicenseEmail(c.env.EMAIL, email, token, from);
    console.log(`Gumroad sale ${saleId}: delivery email sent to ${email}`);
  } catch (err) {
    console.error(`Gumroad sale ${saleId}: email delivery failed (license still issued)`, err);
  }

  return c.json({ success: true, license_id: licenseId, purchase_id: purchaseId, token }, 201);
}

// ── Refund handler ────────────────────────────────────────────────────────

async function handleRefund(c: any, saleId: string): Promise<Response> {
  const purchase = await getPurchaseBySaleId(c.env.DB, saleId);
  if (!purchase) {
    console.warn(`Gumroad refund ${saleId}: no matching purchase found`);
    return c.json({ error: "No purchase found for this sale" }, 404);
  }

  const updated = await markPurchaseRefunded(c.env.DB, saleId);
  if (!updated) {
    return c.json({ message: "Purchase already marked as refunded" });
  }

  const revoked = await revokeLicenseBySaleId(c.env.DB, saleId);
  if (revoked) {
    console.log(`Gumroad refund ${saleId}: license revoked`);
  } else {
    console.warn(`Gumroad refund ${saleId}: no active license to revoke`);
  }

  return c.json({ success: true, refunded: true, license_revoked: revoked });
}

// ── Dispute handler ───────────────────────────────────────────────────────

async function handleDispute(c: any, saleId: string): Promise<Response> {
  const purchase = await getPurchaseBySaleId(c.env.DB, saleId);
  if (!purchase) {
    console.warn(`Gumroad dispute ${saleId}: no matching purchase found`);
    return c.json({ error: "No purchase found for this sale" }, 404);
  }

  const updated = await markPurchaseDisputed(c.env.DB, saleId);
  if (!updated) {
    return c.json({ message: "Purchase already marked as disputed" });
  }

  const revoked = await revokeLicenseBySaleId(c.env.DB, saleId);
  if (revoked) {
    console.log(`Gumroad dispute ${saleId}: license revoked`);
  } else {
    console.warn(`Gumroad dispute ${saleId}: no active license to revoke`);
  }

  return c.json({ success: true, disputed: true, license_revoked: revoked });
}

// ── Dispute won handler ───────────────────────────────────────────────────

async function handleDisputeWon(c: any, saleId: string): Promise<Response> {
  // When a dispute is won, we could re-issue the license. For now, log it.
  // Re-issuance is a manual process via the admin panel (future).
  console.log(`Gumroad dispute_won ${saleId}: dispute resolved in merchant's favor`);
  return c.json({ success: true, message: "Dispute won — manual license re-issuance required" });
}

export default app;
