/**
 * Ed25519 signing/verification for license tokens.
 *
 * PRIVATE KEY lives ONLY in this Worker (as a Cloudflare secret).
 * The PUBLIC key is embedded at build time into the rhumint-hrms app
 * (backend/app/core/license.py) and is safe to distribute — Ed25519
 * public keys cannot derive the private key.
 *
 * Token format (must match rhumint-hrms backend/app/core/license.py):
 *   base64url(payload).base64url(signature)
 *
 * Payload field names MUST match what rhumint-hrms expects:
 *   license_id, org_id, iat, exp (null for lifetime), seats, modules
 *
 * @see rhumint-hrms/backend/app/core/license.py ::verify_token()
 */

export interface LicenseTokenPayload {
  license_id: string;
  org_id: string;
  iat: number;          // Unix timestamp (matches rhumint-hrms field name)
  exp: number | null;   // Unix timestamp or null for lifetime (matches rhumint-hrms)
  seats: number;
  modules: string[];
}

function base64url(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function signToken(
  payload: LicenseTokenPayload,
  privateKeyPem: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBuffer(privateKeyPem),
    { name: "Ed25519" },
    false,
    ["sign"],
  );

  // Use compact JSON (no whitespace) to match rhumint-hrms _encode_token:
  // json.dumps(payload, separators=(",", ":"))
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const signature = await crypto.subtle.sign("Ed25519", key, encoded);

  const payloadB64 = base64url(encoded);
  const sigB64 = base64url(signature);

  return `${payloadB64}.${sigB64}`;
}

function pemToBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
