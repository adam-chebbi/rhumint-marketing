import { Hono } from "hono";
import type { Env } from "../lib/config";
import type { UpdateManifest } from "../types";

const app = new Hono<{ Bindings: Env }>();

app.get("/manifest", (c) => {
  const manifest: UpdateManifest = {
    latest_version: "0.1.0",
    published_at: "2026-07-07T00:00:00Z",
    changelog: "Initial MVP release. See https://github.com/adam-chebbi/rhumint-hrms/releases for details.",
    docker_tag: "ghcr.io/adam-chebbi/rhumint-hrms:0.1.0",
    min_upgradable_version: "0.1.0",
  };
  return c.json(manifest);
});

export default app;
