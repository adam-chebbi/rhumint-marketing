import { describe, it, expect, vi } from "vitest";
import app from "../src/index";
import type { Env } from "../src/lib/config";

// ── D1 Mock ───────────────────────────────────────────────────────────────

function mockD1(results: any[] = []) {
  const run = vi.fn().mockResolvedValue({ meta: { changes: 0 } });
  const first = vi.fn().mockResolvedValue(null);
  const all = vi.fn().mockResolvedValue({ results });
  const prepare = vi.fn().mockReturnValue({ bind: () => ({ run, first, all }) });
  return { prepare, run, first, all, batch: vi.fn() } as unknown as D1Database;
}

const mockEnv: Env = {
  DB: mockD1(),
  ENVIRONMENT: "test",
  ED25519_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END PRIVATE KEY-----",
  EMAIL: {} as SendEmail,
};

// ── Helpers ───────────────────────────────────────────────────────────────

async function get(path: string) {
  return app.request(path, {}, { ...mockEnv } as any);
}

// ── Revocations List Contract ─────────────────────────────────────────────

describe("GET /api/license/revocations/list", () => {
  it("returns the correct top-level shape", async () => {
    const env = { ...mockEnv, DB: mockD1() };
    const res = await app.request("/api/license/revocations/list", {}, { ...env } as any);
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
    vi.spyOn(db, "all").mockResolvedValue({
      results: [
        { license_id: "uuid-1", revoked_at: "2026-07-01T12:00:00Z" },
      ],
    } as any);
    const env = { ...mockEnv, DB: db };
    const res = await app.request("/api/license/revocations/list", {}, { ...env } as any);
    const body = await res.json();
    expect(body.revoked[0]).toHaveProperty("license_id");
    expect(typeof body.revoked[0].license_id).toBe("string");
    expect(body.revoked[0]).toHaveProperty("revoked_at");
    expect(typeof body.revoked[0].revoked_at).toBe("string");
  });
});

// ── Health Contract ───────────────────────────────────────────────────────

describe("GET /health", () => {
  it("returns the correct shape", async () => {
    const res = await get("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("status", "ok");
    expect(body).toHaveProperty("service", "rhumint-central-api");
  });
});

// ── Error Code Contract ───────────────────────────────────────────────────

describe("Error code conventions", () => {
  it("returns 404 with error field for unknown license", async () => {
    const env = { ...mockEnv, DB: mockD1() };
    const res = await app.request("/api/license/nonexistent-id", {}, { ...env } as any);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });

  it("returns 400 with error field for missing required fields on issue", async () => {
    const env = { ...mockEnv, DB: mockD1() };
    const res = await app.request("/api/license/issue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    }, { ...env } as any);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
    expect(typeof body.error).toBe("string");
  });
});
