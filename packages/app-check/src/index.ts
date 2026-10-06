type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

export type AppCheckClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat?: number;
};

export type AppCheckVerificationOptions = {
  projectNumber: string;
  expectedAppId?: string;
  nowSeconds?: number;
  fetcher?: typeof fetch;
};

let jwksCache: { expiresAt: number; keys: Jwk[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

async function getJwks(fetcher: typeof fetch): Promise<Jwk[]> {
  const now = Date.now();
  if (jwksCache && jwksCache.expiresAt > now) return jwksCache.keys;

  const response = await fetcher("https://firebaseappcheck.googleapis.com/v1/jwks", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("APP_CHECK_JWKS_UNAVAILABLE");
  const body = await response.json() as { keys?: Jwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("APP_CHECK_JWKS_EMPTY");
  jwksCache = { keys: body.keys, expiresAt: now + 6 * 60 * 60 * 1000 };
  return body.keys;
}

function audienceIncludes(aud: string | string[], expected: string): boolean {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

export async function verifyFirebaseAppCheckToken(
  token: string,
  options: AppCheckVerificationOptions,
): Promise<AppCheckClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("APP_CHECK_MALFORMED_TOKEN");
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("APP_CHECK_MALFORMED_TOKEN");

  const header = decodeJson<{ alg?: string; typ?: string; kid?: string }>(encodedHeader);
  if (header.alg !== "RS256" || header.typ !== "JWT" || !header.kid) throw new Error("APP_CHECK_HEADER_INVALID");

  const claims = decodeJson<AppCheckClaims>(encodedPayload);
  if (!claims || typeof claims !== "object") throw new Error("APP_CHECK_CLAIMS_INVALID");
  if (typeof claims.iss !== "string" || typeof claims.sub !== "string" || typeof claims.exp !== "number") {
    throw new Error("APP_CHECK_CLAIMS_INVALID");
  }

  const expectedIssuer = "https://firebaseappcheck.googleapis.com/" + options.projectNumber;
  if (claims.iss !== expectedIssuer) throw new Error("APP_CHECK_ISSUER_MISMATCH");
  if (!audienceIncludes(claims.aud, "projects/" + options.projectNumber)) throw new Error("APP_CHECK_AUDIENCE_MISMATCH");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now) throw new Error("APP_CHECK_EXPIRED");
  if (options.expectedAppId && claims.sub !== options.expectedAppId) throw new Error("APP_CHECK_APP_MISMATCH");

  const keys = await getJwks(options.fetcher ?? fetch);
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("APP_CHECK_KEY_NOT_FOUND");

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signatureBytes = decodeBase64Url(encodedSignature);
  const signature = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength,
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(encodedHeader + "." + encodedPayload),
  );
  if (!valid) throw new Error("APP_CHECK_SIGNATURE_INVALID");
  return claims;
}

export function resetAppCheckJwksCacheForTests(): void {
  jwksCache = null;
}
