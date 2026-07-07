import { Hono } from "hono";
import type { Env } from "../lib/config";
import { listPurchases, getAdminStats } from "../lib/db";

const app = new Hono<{ Bindings: Env }>();

function requireAdmin(c: any, env: Env): boolean {
  const key = env.ADMIN_API_KEY;
  if (!key) {
    c.json({ error: "Admin API not configured" }, 500);
    return false;
  }
  const auth = c.req.header("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || token !== key) {
    c.json({ error: "Unauthorized" }, 401);
    return false;
  }
  return true;
}

app.get("/purchases", async (c) => {
  if (!requireAdmin(c, c.env)) return;
  const purchases = await listPurchases(c.env.DB);
  return c.json({ purchases });
});

app.get("/stats", async (c) => {
  if (!requireAdmin(c, c.env)) return;
  const stats = await getAdminStats(c.env.DB);
  return c.json(stats);
});

export default app;
