import { describe, expect, it, vi } from "vitest";
import { handleRequest, handleBrowserRequest, resetHubJwksCacheForTests, type Env } from "../../apps/api/src/index.js";

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
          all: vi.fn(async () => ({ results: [] })),
        };
        statement.bind.mockReturnValue(statement);
        return statement;
      }),
    } as never,
    HUB_JWKS_URL: "https://www.millionsnest.com/api/v1/ai/jwks",
    HUB_TOKEN_ISSUER: "https://millionsnest.com",
    NESTAI_TOKEN_AUDIENCE: "nestai",
    FIREBASE_PROJECT_NUMBER: "555464791734",
    APP_CHECK_REQUIRED: "false",
    AI_BILLING_MODE: "FREE_ONLY",
    ALLOW_PAID_FALLBACK: "false",
    AUTO_UPGRADE_PROVIDER: "false",
    AI_PAID_ENABLED: "false",
    AI_ALL_ENABLED: "true",
    AI_EXTERNAL_PROVIDERS_ENABLED: "true",
    AI_TOOLS_WRITE_ENABLED: "false",
    AI_CONNECT_ENABLED: "true",
    AI_FINANCE_ENABLED: "true",
    AI_NESTLUME_ENABLED: "true",
    AI_NESTAFFILIATE_ENABLED: "true",
    AI_NESTLOCAL_ENABLED: "true",
    AI_NESTJOURNEY_ENABLED: "true",
    AI_MUSICSCALE_ENABLED: "true",
    AI_HUB_ENABLED: "true",
    AI_JOBS_ENABLED: "false",
    AI_VECTORIZE_ENABLED: "false",
    AI_R2_WRITES_ENABLED: "false",
  };
}


async function issueWorkerToken(overrides: Record<string, unknown> = {}) {
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
    capabilities: ["ai:run", "ai:stream"],
    iat: now,
    exp: now + 300,
    ...overrides,
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
    await expect(response.json()).resolves.toEqual({
      ok: true,
      state: "operational",
      service: "nestai",
      billingMode: "FREE_ONLY",
      appCheck: "optional",
      layers: {
        edge: "ready",
        auth: "ready",
        config: "ready",
        d1: "ready",
        kv: "unconfigured",
        queue: "unconfigured",
        vectorize: "blocked",
      },
      providers: {
        cloudflare: "ready",
        groq: "unconfigured",
        gemini: "unconfigured",
        mistral: "unconfigured",
      },
    });
  });

  it("allows a constrained guest token for NestLume P1", async () => {
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken({
      sub: "guest:test",
      organizationId: "public:nestlume",
      appId: "nestlume",
      tokenType: "guest",
      appCheckAppId: "1:555464791734:web:test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const env = baseEnv();
    env.APP_CHECK_REQUIRED = "false";
    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-millionsnest-app": "nestlume",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "Explique o texto fornecido.",
        context: { organizationId: "public:nestlume", locale: "pt-BR" },
      }),
    }), env);

    expect(response.status).toBe(200);
    fetchMock.mockRestore();
  });

  it("denies P2 data detected inside an otherwise P1 guest task", async () => {
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken({
      sub: "guest:test",
      organizationId: "public:nestlume",
      appId: "nestlume",
      tokenType: "guest",
      appCheckAppId: "1:555464791734:web:test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const env = baseEnv();
    env.APP_CHECK_REQUIRED = "false";
    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-millionsnest-app": "nestlume",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "Contato pessoal: email exemplo@dominio.com; explique Provérbios.",
        context: { organizationId: "public:nestlume", locale: "pt-BR" },
      }),
    }), env);
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: "AUTH_GUEST_SENSITIVITY_DENIED" });
    fetchMock.mockRestore();
  });

  it("denies guest tokens from P2 tasks even with valid signature and capability", async () => {
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken({
      sub: "guest:test",
      organizationId: "public:connect",
      appId: "connect",
      tokenType: "guest",
      appCheckAppId: "1:555464791734:web:test",
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const env = baseEnv();
    env.APP_CHECK_REQUIRED = "false";
    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-millionsnest-app": "connect",
      },
      body: JSON.stringify({
        task: "connect.reply.suggest",
        input: "Mensagem pessoal de teste",
        context: { organizationId: "public:connect", locale: "pt-BR" },
      }),
    }), env);

    expect(response.status).toBe(401);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("AUTH_GUEST_SENSITIVITY_DENIED");
    fetchMock.mockRestore();
  });

  it("allows CORS preflight only for exact official ecosystem origins", async () => {
    const env = baseEnv();
    const allowed = await handleBrowserRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "OPTIONS",
      headers: { origin: "https://nestlume.millionsnest.com", "access-control-request-method": "POST" },
    }), env);
    expect(allowed.status).toBe(204);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://nestlume.millionsnest.com");
    expect(allowed.headers.get("access-control-allow-headers")).toContain("x-firebase-appcheck");

    const denied = await handleBrowserRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "OPTIONS",
      headers: { origin: "https://nestlume.millionsnest.com.attacker.invalid" },
    }), env);
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
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
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/run", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-millionsnest-app": "nestlume",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "Explique Provérbios 2.",
        context: { organizationId: "org-1", locale: "pt-BR" },
      }),
    }), baseEnv());

    expect(response.status).toBe(200);
    const body = await response.json() as {
      requestId: string;
      task: string;
      version: number;
      result: string;
      meta: { providerClass: string; fallbackUsed: boolean };
    };
    expect(body.task).toBe("nestlume.study.answer");
    expect(body.version).toBe(1);
    expect(body.result).toBe("ok");
    expect(body.meta.providerClass).toBe("free");
    expect(body.meta.fallbackUsed).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    fetchMock.mockRestore();
  });


  it("streams canonical SSE without exposing provider model metadata", async () => {
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const env = baseEnv();
    const encoder = new TextEncoder();
    env.AI = {
      run: vi.fn(async (_model: string, input: unknown) => {
        if ((input as { stream?: boolean }).stream) {
          return new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"response":"Olá"}\n\n'));
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              controller.close();
            },
          });
        }
        return { response: "ok" };
      }),
    };

    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/chat/stream", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-millionsnest-app": "nestlume",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "Explique Provérbios 2.",
        context: { organizationId: "org-1", locale: "pt-BR" },
      }),
    }), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("event: start");
    expect(text).toContain('event: delta');
    expect(text).toContain('"text":"Olá"');
    expect(text).toContain("event: complete");
    expect(text).not.toContain("@cf/");
    fetchMock.mockRestore();
  });

  it("reports D1 degradation without exposing internal details", async () => {
    const env = baseEnv();
    env.DB = {
      prepare: vi.fn(() => { throw new Error("D1_DOWN"); }),
    } as never;
    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/health"), env);
    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; state: string; layers: Record<string,string> };
    expect(body.ok).toBe(false);
    expect(body.state).toBe("degraded");
    expect(body.layers.d1).toBe("degraded");
  });

  it("turns a partial provider stream failure into a canonical SSE error event", async () => {
    resetHubJwksCacheForTests();
    const { token, publicJwk } = await issueWorkerToken();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      keys: [publicJwk],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const env = baseEnv();
    const encoder = new TextEncoder();
    env.AI = {
      run: vi.fn(async (_model: string, input: unknown) => {
        if ((input as { stream?: boolean }).stream) {
          return new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(encoder.encode('data: {"response":"parcial"}\n\n'));
              controller.error(new Error("capacity lost"));
            },
          });
        }
        return { response: "ok" };
      }),
    };

    const response = await handleRequest(new Request("https://ai.millionsnest.com/v1/chat/stream", {
      method: "POST",
      headers: {
        authorization: "Bearer " + token,
        "content-type": "application/json",
        "x-millionsnest-app": "nestlume",
        accept: "text/event-stream",
      },
      body: JSON.stringify({
        task: "nestlume.study.answer",
        input: "teste de stream",
        context: { organizationId: "org-1", locale: "pt-BR" },
      }),
    }), env);

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain("event: start");
    expect(text).toContain("event: error");
    expect(text).not.toContain("@cf/");
    fetchMock.mockRestore();
  });

  it("does not expose task execution on arbitrary paths", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/admin"), baseEnv());
    expect(response.status).toBe(404);
  });
});
