import { describe, expect, it, vi } from "vitest";
import { handleRequest, type Env } from "../../apps/api/src/index.js";

function baseEnv(): Env {
  return {
    AI: { run: vi.fn(async () => ({ response: "ok" })) },
    AI_RATE_LIMITER: { limit: vi.fn(async () => ({ success: true })) },
    HUB_TOKEN_PUBLIC_JWK: "{}",
    HUB_TOKEN_ISSUER: "https://millionsnest.com",
    NESTAI_TOKEN_AUDIENCE: "nestai",
    AI_BILLING_MODE: "FREE_ONLY",
    ALLOW_PAID_FALLBACK: "false",
    AUTO_UPGRADE_PROVIDER: "false",
    AI_PAID_ENABLED: "false",
  };
}

describe("Worker API", () => {
  it("exposes a minimal non-secret health response", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/health"), baseEnv());
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, service: "nestai", billingMode: "FREE_ONLY" });
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

  it("does not expose task execution on arbitrary paths", async () => {
    const response = await handleRequest(new Request("https://ai.millionsnest.com/admin"), baseEnv());
    expect(response.status).toBe(404);
  });
});
