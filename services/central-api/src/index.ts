import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./lib/config";
import licenseRoutes from "./routes/license";
import updatesRoutes from "./routes/updates";
import webhookRoutes from "./routes/webhooks";
import adminRoutes from "./routes/admin";

const app = new Hono<{ Bindings: Env }>();

app.use("/*", cors());

app.get("/health", (c) => {
  return c.json({ status: "ok", service: "rhumint-central-api" });
});

app.route("/api/license", licenseRoutes);
app.route("/api/updates", updatesRoutes);
app.route("/api/webhooks", webhookRoutes);
app.route("/api/admin", adminRoutes);

export default app;
