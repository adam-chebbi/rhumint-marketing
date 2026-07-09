import { describe, it, expect, vi } from "vitest";
import app from "../src/index";
import type { Env } from "../lib/config";

// ── D1 Mock — must support both prepare().all() and prepare().bind().all() ──

function mockD1(results: any[] = []) {
  const runFn = vi.fn().mockResolvedValue({ meta: { changes: 0 }, success: true });
  const firstFn = vi.fn().mockResolvedValue(null);
  const allFn = vi.fn().mockResolvedValue({ results });
  const prep = {
    run: runFn,
    first: firstFn,
    all: allFn,
    bind: vi.fn().mockReturnValue({ run: runFn, first: firstFn, all: allFn }),
  };
  const prepare = vi.fn().mockReturnValue(prep);
  return { prepare, batch: vi.fn() } as unknown as D1Database;
}

const mockPrivateKey =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIMUjzVgqCJS8ujYQeofFncda8IHYHQnkOYnFGeBtxXIz\n-----END PRIVATE KEY-----";

const mockEnv: Env = {
  DB: mockD1(),
  ENVIRONMENT: "test",
  ED25519_PRIVATE_KEY: mockPrivateKey,
  GUMROAD_WEBHOOK_SECRET: "test-webhook-secret",
  ADMIN_API_KEY: "test-admin-key",
  EMAIL: {} as SendEmail,
};

async function get(path: string) {
  return app.request(path, {}, { ...mockEnv } as any);
}

async function post(path: string, body: any, key?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return app.request(path, { method: "POST", headers, body: JSON.stringify(body) }, { ...mockEnv } as any);
}

// ── Revocations List Contract (§2.1) ─────────────────────────────────────

describe("GET /api/license/revocations/list", () => {
  it("returns the correct top-level shape", async () => {
    const res = await get("/api/license/revocations/list");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("count");
    expect(typeof body.count).toBe("number");
    expect(body).toHaveProperty("revoked");
    expect(Array.isArray(body.revoked)).toBe(true);
  });

  it("returns empty revoked list when none exist", async () => {
    const env = { ...mockEnv, DB: mockD1([]) };
    const res = await app.request("/api/license/revocations/list", {}, { ...env } as any);
    const body = await res.json();
    expect(body.count).toBe(0);
    expect(body.revoked).toEqual([]);
  });

  it("each revoked entry has the correct shape", async () => {
    const db = mockD1([
      { license_id: "uuid-1", revoked_at: "2026-07-01T12:00:00Z" },
    ]);
    const env = { ...mockEnv, DB: db };
    const res = await app.request("/api/license/revocations/list", {}, { ...env } as any);
    const body = await res.json();
    expect(body.revoked[0]).toHaveProperty("license_id");
    expect(typeof body.revoked[0].license_id).toBe("string");
    expect(body.revoked[0]).toHaveProperty("revoked_at");
    expect(typeof body.revoked[0].revoked_at).toBe("string");
  });
});

// ── License Issue Contract (§1 + §2) ─────────────────────────────────────

describe("POST /api/license/issue", () => {
  it("issues a license with correct token format", async () => {
    const db = mockD1();
    (db as any).prepare = vi.fn().mockReturnValue({
      run: vi.fn().mockResolvedValue({ meta: {}, success: true }),
      first: vi.fn().mockResolvedValue(null),
      all: vi.fn().mockResolvedValue({ results: [] }),
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({ meta: {}, success: true }),
        first: vi.fn().mockResolvedValue(null),
        all: vi.fn().mockResolvedValue({ results: [] }),
      }),
    });
    const env = { ...mockEnv, DB: db };

    const res = await app.request(
      "/api/license/issue",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: "qa-org", seats: 5, modules: ["core"] }),
      },
      { ...env } as any,
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("license_id");
    expect(body).toHaveProperty("token");

    // Token format: base64url(payload).base64url(signature)
    const parts = body.token.split(".");
    expect(parts.length).toBe(2);

    // Payload decodes to contract field names
    const raw = atob(parts[0].replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(raw);
    expect(payload).toHaveProperty("license_id");
    expect(payload).toHaveProperty("org_id", "qa-org");
    expect(payload).toHaveProperty("iat");
    expect(payload).toHaveProperty("exp", null);
    expect(payload).toHaveProperty("seats", 5);
    expect(payload).toHaveProperty("modules");

    // Canonical JSON: no whitespace
    expect(raw).not.toContain(" ");
  });

  it("rejects missing required fields", async () => {
    const res = await post("/api/license/issue", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Extend License Contract ──────────────────────────────────────────────

describe("POST /api/license/:id/extend", () => {
  it("returns 404 for nonexistent license", async () => {
    const res = await post("/api/license/no-such-id/extend", { expires_at: "2027-01-01" });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Revoke License Contract ──────────────────────────────────────────────

describe("POST /api/license/:id/revoke", () => {
  it("returns 404 for nonexistent license", async () => {
    const res = await post("/api/license/no-such-id/revoke", {});
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Health Contract ─────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns the correct shape", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "rhumint-central-api");
  });
});

// ── Error Code Contract (§3) ────────────────────────────────────────────

describe("Error code conventions", () => {
  it("returns 404 with error field for unknown license", async () => {
    const res = await get("/api/license/no-such-id");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 with error field for missing fields on issue", async () => {
    const res = await post("/api/license/issue", {});
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ── Admin API Contract ──────────────────────────────────────────────────

describe("Admin API endpoints", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await app.request("/api/admin/stats", {}, { ...mockEnv } as any);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("rejects wrong API key with 401", async () => {
    const res = await app.request(
      "/api/admin/stats",
      { headers: { Authorization: "Bearer wrong-key" } },
      { ...mockEnv } as any,
    );
    expect(res.status).toBe(401);
  });
});

// ── Gumroad Webhook Contract ────────────────────────────────────────────

describe("POST /api/webhooks/gumroad", () => {
  it("rejects missing signature with 401", async () => {
    const res = await app.request(
      "/api/webhooks/gumroad",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "event=ping",
      },
      { ...mockEnv } as any,
    );
    expect(res.status).toBe(401);
  });
});
