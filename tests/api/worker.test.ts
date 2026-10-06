import { describe, expect, it, vi } from "vitest";
import { handleRequest, type Env } from "../../apps/api/src/index.js";

function baseEnv(): Env {
  return {
    AI: { run: vi.fn(async () => ({ response: "ok" })) },
    AI_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    DB: {
      prepare: vi.fn(() => {
        const statement = {
          bind: vi.fn(),
          first: vi.fn(async () => null),
          run: vi.fn(async () => ({})),
        };
        statement.bind.mockReturnValue(statement);
        return statement;
      }),
    } as never,
    HUB_JWKS_URL: "https://www.millionsnest.com/api/v1/ai/jwks",
    HUB_TOKEN_ISSUER: "https://millionsnest.com",
    NESTAI_TOKEN_AUDIENCE: "nestai",
    AI_BILLING_MODE: "FREE_ONLY",
    ALLOW_PAID_FALLBACK: "false",
    AUTO_UPGRADE_PROVIDER: "false",
    AI_PAID_ENABLED: "false",
  };
}


async function issueWorkerToken() {
  const pair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "ES256", typ: "JWT", kid: "test-key" });
  const payload = encode({
    iss: "https://millionsnest.com",
    aud: "nestai",
    sub: "user-1",
    organizationId: "org-1",
    appId: "nestlume",
    capabilities: ["ai:run"],
    iat: now,
    exp: now + 300,
  });
  const input = `${header}.${payload}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    pair.privateKey,
    new TextEncoder().encode(input),
  );
  return {
    token: `${input}.${Buffer.from(signature).toString("base64url")}`,
    publicJwk: { ...publicJwk, kid: "test-key", alg: "ES256", use: "sig" },
  };
}

describe("Worker API", () => {
  it("exposes a minimal non-secret health response", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/health"), baseEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "nestai", billingMode: "FREE_ONLY", providers: { cloudflare: "ready", groq: "unconfigured" } });
  });

  it("requires authentication for task execution", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task: "nestlume.study.answer", input: "test", context: { organizationId: "org-1" } }),
    }), baseEnv());
    expect(response.status).toBe(401);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("AUTH_MISSING_BEARER");
  });


  it("executes an authenticated tenant-scoped task through JWKS and Workers AI", async () => {
    const { token, publicJwk } = await issueWorkerToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "Explique Provérbios 2.",
        context: { organizationId: "org-1", locale: "pt-BR" },
      }),
    }), baseEnv());

    expect(response.status).toBe(200);
    const body = await response.json() as { output: string; route: { provider: string } };
    expect(body.output).toBe("ok");
    expect(body.route.provider).toBe("cloudflare");
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });

  it("does not expose task execution on arbitrary paths", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/admin"), baseEnv());
    expect(response.status).toBe(404);
  });
});
