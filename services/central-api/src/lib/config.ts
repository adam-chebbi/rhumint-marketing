export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  ED25519_PRIVATE_KEY: string;
  GUMROAD_WEBHOOK_SECRET?: string;
  RELEASE_API_KEY?: string;
  ADMIN_API_KEY?: string;
  EMAIL: SendEmail;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

export function getPrivateKey(env: Env): string {
  const key = env.ED25519_PRIVATE_KEY;
  if (!key) {
    throw new Error("ED25519_PRIVATE_KEY is not configured");
  }
  return key;
}

export function getEmailFrom(env: Env): { email: string; name: string } {
  return {
    email: env.EMAIL_FROM ?? "license@rhumint.com",
    name: env.EMAIL_FROM_NAME ?? "Rhumint Licenses",
  };
}

export function isProduction(env: Env): boolean {
  return env.ENVIRONMENT === "production";
}
