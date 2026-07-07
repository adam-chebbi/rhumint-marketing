const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;

async function getKey(password: string): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(password);
  return crypto.subtle.importKey("raw", enc, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSessionToken(password: string): Promise<string> {
  const exp = Date.now() + SESSION_DURATION_MS;
  const payload = btoa(JSON.stringify({ exp }));
  const key = await getKey(password);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return `${payload}.${sigB64}`;
}

export async function verifySessionToken(token: string, password: string): Promise<boolean> {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return false;
    const payload = JSON.parse(atob(parts[0]));
    if (payload.exp < Date.now()) return false;
    const key = await getKey(password);
    const sig = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(parts[0]));
  } catch {
    return false;
  }
}
