import { Hono } from "hono";
import type { Env } from "../lib/config";
import { listPurchases, getAdminStats, listTickets, createTicket, closeTicket, getLatestHeartbeats } from "../lib/db";
import type { Ticket } from "../types";

const app = new Hono<{ Bindings: Env }>();

function requireAdmin(c: any, env: Env): Response | null {
  const key = env.ADMIN_API_KEY;
  if (!key) {
    return c.json({ error: "Admin API not configured" }, 500);
  }
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== key) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  return null;
}

app.get("/purchases", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const purchases = await listPurchases(c.env.DB);
  return c.json({ purchases });
});

app.get("/stats", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const stats = await getAdminStats(c.env.DB);
  return c.json(stats);
});

// ── Tickets ───────────────────────────────────────────────────────────────

app.get("/tickets", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const tickets = await listTickets(c.env.DB);
  return c.json({ tickets });
});

app.post("/tickets", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const body = await c.req.json<{
    org_id?: string;
    contact_email?: string;
    subject: string;
    description?: string;
    priority?: string;
  }>();

  if (!body.subject) {
    return c.json({ error: "subject is required" }, 400);
  }

  const now = new Date().toISOString();
  const ticket: Ticket = {
    id: crypto.randomUUID(),
    org_id: body.org_id ?? null,
    contact_email: body.contact_email ?? null,
    subject: body.subject,
    description: body.description ?? "",
    status: "open",
    priority: body.priority ?? "normal",
    created_at: now,
    closed_at: null,
  };

  await createTicket(c.env.DB, ticket);
  return c.json({ ticket }, 201);
});

app.post("/tickets/:id/close", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const ok = await closeTicket(c.env.DB, c.req.param("id"));
  if (!ok) return c.json({ error: "Ticket not found or already closed" }, 404);
  return c.json({ success: true });
});

// ── Versions ──────────────────────────────────────────────────────────────

app.get("/versions", async (c) => {
  const auth = requireAdmin(c, c.env);
  if (auth) return auth;
  const heartbeats = await getLatestHeartbeats(c.env.DB);
  return c.json({ heartbeats });
});

export default app;
