export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
}

export async function checkRateLimit(
  db: D1Database,
  ip: string,
  route: string,
  maxRequests: number,
  windowSeconds = 60,
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;

  await db
    .prepare("DELETE FROM rate_limits WHERE window_ts < ?")
    .bind(now - windowSeconds * 2)
    .run();

  const row = await db
    .prepare("SELECT count FROM rate_limits WHERE ip = ? AND route = ? AND window_ts = ?")
    .bind(ip, route, windowStart)
    .first<{ count: number }>();

  if (row && row.count >= maxRequests) {
    return { allowed: false, retryAfter: windowStart + windowSeconds - now };
  }

  await db
    .prepare(
      "INSERT INTO rate_limits (ip, route, window_ts, count) VALUES (?, ?, ?, 1) ON CONFLICT(ip, route, window_ts) DO UPDATE SET count = count + 1",
    )
    .bind(ip, route, windowStart)
    .run();

  return { allowed: true };
}

export function getClientIp(c: any): string {
  return c.req.header("CF-Connecting-IP") ?? c.req.header("X-Forwarded-For") ?? "unknown";
}
