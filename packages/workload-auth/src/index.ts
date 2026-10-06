export type GitHubWorkloadClaims = {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  repository: string;
  repository_owner: string;
  ref?: string;
  sha?: string;
  workflow?: string;
  actor?: string;
};

type Jwk = JsonWebKey & { kid?: string; alg?: string; use?: string };
let cache: { expiresAt: number; keys: Jwk[] } | null = null;

function decodeBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(normalized + padding);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson<T>(value: string): T {
  return JSON.parse(new TextDecoder().decode(decodeBase64Url(value))) as T;
}

function audienceIncludes(aud: string | string[], expected: string): boolean {
  return Array.isArray(aud) ? aud.includes(expected) : aud === expected;
}

async function githubJwks(fetcher: typeof fetch): Promise<Jwk[]> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) return cache.keys;
  const response = await fetcher("https://token.actions.githubusercontent.com/.well-known/jwks", {
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("WORKLOAD_JWKS_UNAVAILABLE");
  const body = await response.json() as { keys?: Jwk[] };
  if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("WORKLOAD_JWKS_EMPTY");
  cache = { keys: body.keys, expiresAt: now + 6 * 60 * 60 * 1000 };
  return body.keys;
}

export async function verifyGitHubWorkloadToken(
  token: string,
  options: {
    audience: string;
    repositoryOwner: string;
    expectedRepository?: string;
    nowSeconds?: number;
    fetcher?: typeof fetch;
  },
): Promise<GitHubWorkloadClaims> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("WORKLOAD_TOKEN_MALFORMED");
  const [header64, payload64, signature64] = parts;
  if (!header64 || !payload64 || !signature64) throw new Error("WORKLOAD_TOKEN_MALFORMED");

  const header = decodeJson<{ alg?: string; kid?: string }>(header64);
  if (header.alg !== "RS256" || !header.kid) throw new Error("WORKLOAD_HEADER_INVALID");
  const claims = decodeJson<GitHubWorkloadClaims>(payload64);

  if (claims.iss !== "https://token.actions.githubusercontent.com") throw new Error("WORKLOAD_ISSUER_MISMATCH");
  if (!audienceIncludes(claims.aud, options.audience)) throw new Error("WORKLOAD_AUDIENCE_MISMATCH");
  if (claims.repository_owner !== options.repositoryOwner) throw new Error("WORKLOAD_OWNER_DENIED");
  if (options.expectedRepository && claims.repository !== options.expectedRepository) throw new Error("WORKLOAD_REPOSITORY_MISMATCH");
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (claims.exp <= now || claims.iat > now + 60) throw new Error("WORKLOAD_TOKEN_EXPIRED");

  const keys = await githubJwks(options.fetcher ?? fetch);
  const jwk = keys.find((candidate) => candidate.kid === header.kid);
  if (!jwk) throw new Error("WORKLOAD_KEY_NOT_FOUND");
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const sigBytes = decodeBase64Url(signature64);
  const signature = sigBytes.buffer.slice(sigBytes.byteOffset, sigBytes.byteOffset + sigBytes.byteLength) as ArrayBuffer;
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature,
    new TextEncoder().encode(header64 + "." + payload64),
  );
  if (!valid) throw new Error("WORKLOAD_SIGNATURE_INVALID");
  return claims;
}

export function resetGitHubWorkloadJwksCacheForTests(): void {
  cache = null;
}
