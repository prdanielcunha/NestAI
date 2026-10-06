export type NestAiClaims = {
  iss: string;
  aud: string;
  sub: string;
  organizationId: string;
  appId: string;
  capabilities: string[];
  iat: number;
  exp: number;
  nbf?: number;
  jti?: string;
};

export type VerifyTokenOptions = {
  issuer: string;
  audience: string;
  publicJwk: JsonWebKey;
  nowSeconds?: number;
  expectedOrganizationId?: string;
  expectedAppId?: string;
};

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function assertClaims(value: unknown): asserts value is NestAiClaims {
  if (!value || typeof value !== "object") throw new Error("AUTH_INVALID_CLAIMS");
  const claims = value as Partial<NestAiClaims>;
  if (
    typeof claims.iss !== "string" ||
    typeof claims.aud !== "string" ||
    typeof claims.sub !== "string" ||
    typeof claims.organizationId !== "string" ||
    typeof claims.appId !== "string" ||
    !Array.isArray(claims.capabilities) ||
    !claims.capabilities.every((item) => typeof item === "string") ||
    typeof claims.iat !== "number" ||
    typeof claims.exp !== "number"
  ) {
    throw new Error("AUTH_INVALID_CLAIMS");
  }
}

export async function verifyNestAiToken(token: string, options: VerifyTokenOptions): Promise<NestAiClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("AUTH_MALFORMED_TOKEN");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw new Error("AUTH_MALFORMED_TOKEN");

  const header = decodeJson<{ alg?: string; typ?: string }>(encodedHeader);
  if (header.alg !== "ES256") throw new Error("AUTH_UNSUPPORTED_ALG");

  const key = await crypto.subtle.importKey(
    "jwk",
    options.publicJwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["verify"],
  );

  const signed = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const signatureBytes = decodeBase64Url(encodedSignature);
  const signature = signatureBytes.buffer.slice(
    signatureBytes.byteOffset,
    signatureBytes.byteOffset + signatureBytes.byteLength,
  ) as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    signed,
  );
  if (!valid) throw new Error("AUTH_BAD_SIGNATURE");

  const claims = decodeJson<unknown>(encodedPayload);
  assertClaims(claims);

  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.iss !== options.issuer || claims.aud !== options.audience) throw new Error("AUTH_WRONG_ISSUER_OR_AUDIENCE");
  if (claims.exp <= now) throw new Error("AUTH_EXPIRED");
  if (claims.nbf !== undefined && claims.nbf > now) throw new Error("AUTH_NOT_YET_VALID");
  if (claims.iat > now + 60) throw new Error("AUTH_INVALID_IAT");
  if (options.expectedOrganizationId && claims.organizationId !== options.expectedOrganizationId) throw new Error("AUTH_TENANT_MISMATCH");
  if (options.expectedAppId && claims.appId !== options.expectedAppId) throw new Error("AUTH_APP_MISMATCH");

  return claims;
}

export function requireCapability(claims: NestAiClaims, capability: string): void {
  if (!claims.capabilities.includes(capability)) throw new Error("AUTH_CAPABILITY_DENIED");
}
