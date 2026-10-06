import { describe, expect, it } from "vitest";
import { requireCapability, verifyNestAiToken } from "../../packages/auth/src/index.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function issueToken(overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const now = 2_000_000_000;
  const header = encode({ alg: "ES256", typ: "JWT" });
  const payload = encode({
    iss: "https://hub.millionsnest.com",
    aud: "nestai",
    sub: "user-1",
    organizationId: "org-1",
    appId: "musicscale",
    capabilities: ["ai:run"],
    iat: now - 5,
    exp: now + 120,
    ...overrides,
  });
  const signingInput = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const token = `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
  return { token, publicJwk, now };
}

describe("Hub token verification", () => {
  it("accepts a valid short-lived tenant-scoped token", async () => {
    const { token, publicJwk, now } = await issueToken();
    const claims = await verifyNestAiToken(token, {
      issuer: "https://hub.millionsnest.com",
      audience: "nestai",
      publicJwk,
      nowSeconds: now,
      expectedOrganizationId: "org-1",
      expectedAppId: "musicscale",
    });
    expect(claims.sub).toBe("user-1");
    expect(() => requireCapability(claims, "ai:run")).not.toThrow();
  });

  it("rejects cross-tenant token reuse", async () => {
    const { token, publicJwk, now } = await issueToken();
    await expect(verifyNestAiToken(token, {
      issuer: "https://hub.millionsnest.com",
      audience: "nestai",
      publicJwk,
      nowSeconds: now,
      expectedOrganizationId: "org-2",
    })).rejects.toThrow("AUTH_TENANT_MISMATCH");
  });

  it("rejects expired tokens", async () => {
    const { token, publicJwk, now } = await issueToken({ exp: 1_999_999_999 });
    await expect(verifyNestAiToken(token, {
      issuer: "https://hub.millionsnest.com",
      audience: "nestai",
      publicJwk,
      nowSeconds: now,
    })).rejects.toThrow("AUTH_EXPIRED");
  });

  it("denies missing capabilities", async () => {
    const { token, publicJwk, now } = await issueToken();
    const claims = await verifyNestAiToken(token, {
      issuer: "https://hub.millionsnest.com",
      audience: "nestai",
      publicJwk,
      nowSeconds: now,
    });
    expect(() => requireCapability(claims, "ai:admin")).toThrow("AUTH_CAPABILITY_DENIED");
  });
});
