import { describe, expect, it } from "vitest";
import { resetAppCheckJwksCacheForTests, verifyFirebaseAppCheckToken } from "../../packages/app-check/src/index.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function issueAppCheckToken(overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const now = 2_000_000_000;
  const header = encode({ alg: "RS256", typ: "JWT", kid: "appcheck-test" });
  const payload = encode({
    iss: "https://firebaseappcheck.googleapis.com/555464791734",
    aud: ["projects/555464791734"],
    sub: "1:555464791734:web:test",
    iat: now - 5,
    exp: now + 300,
    ...overrides,
  });
  const input = header + "." + payload;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    new TextEncoder().encode(input),
  );
  return {
    token: input + "." + Buffer.from(signature).toString("base64url"),
    publicJwk: { ...publicJwk, kid: "appcheck-test", alg: "RS256", use: "sig" },
    now,
  };
}

function jwksFetch(publicJwk: JsonWebKey): typeof fetch {
  return (async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })) as typeof fetch;
}

describe("Firebase App Check verification", () => {
  it("accepts a valid project and app token", async () => {
    resetAppCheckJwksCacheForTests();
    const { token, publicJwk, now } = await issueAppCheckToken();
    const claims = await verifyFirebaseAppCheckToken(token, {
      projectNumber: "555464791734",
      expectedAppId: "1:555464791734:web:test",
      nowSeconds: now,
      fetcher: jwksFetch(publicJwk),
    });
    expect(claims.sub).toBe("1:555464791734:web:test");
  });

  it("rejects a token from another Firebase project", async () => {
    resetAppCheckJwksCacheForTests();
    const { token, publicJwk, now } = await issueAppCheckToken();
    await expect(verifyFirebaseAppCheckToken(token, {
      projectNumber: "999",
      nowSeconds: now,
      fetcher: jwksFetch(publicJwk),
    })).rejects.toThrow("APP_CHECK_ISSUER_MISMATCH");
  });

  it("rejects app-id mismatch", async () => {
    resetAppCheckJwksCacheForTests();
    const { token, publicJwk, now } = await issueAppCheckToken();
    await expect(verifyFirebaseAppCheckToken(token, {
      projectNumber: "555464791734",
      expectedAppId: "other-app",
      nowSeconds: now,
      fetcher: jwksFetch(publicJwk),
    })).rejects.toThrow("APP_CHECK_APP_MISMATCH");
  });

  it("rejects expired tokens", async () => {
    resetAppCheckJwksCacheForTests();
    const { token, publicJwk, now } = await issueAppCheckToken({ exp: 1_999_999_999 });
    await expect(verifyFirebaseAppCheckToken(token, {
      projectNumber: "555464791734",
      nowSeconds: now,
      fetcher: jwksFetch(publicJwk),
    })).rejects.toThrow("APP_CHECK_EXPIRED");
  });
});
