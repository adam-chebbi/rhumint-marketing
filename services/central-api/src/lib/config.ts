export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ED25519_PRIVATE_KEY: string;
  GUMROAD_WEBHOOK_SECRET?: string;
}

export function getPrivateKey(env: Env): string {
  const key = env.ED25519_PRIVATE_KEY;
  if (!key) {
    throw new Error("ED25519_PRIVATE_KEY is not configured");
  }
  return key;
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}
