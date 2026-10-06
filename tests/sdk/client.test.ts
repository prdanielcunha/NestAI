import { describe, expect, it, vi } from "vitest";
import { NestAiClient } from "../../packages/sdk/src/index.js";

describe("NestAI SDK", () => {
  it("sends only task input tenant and short-lived bearer token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      traceId: "trace-1",
      output: "ok",
      route: { provider: "cloudflare", model: "model" },
      sensitivity: "P1_INTERNAL",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const client = new NestAiClient({
      baseUrl: "https://ai.millionsnest.com",
      organizationId: "org-1",
      getToken: async () => "short-lived-token",
    });
    await expect(client.run({ task: "nestlume.study.answer", input: "hello" })).resolves.toMatchObject({ output: "ok" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer short-lived-token");
    expect(JSON.parse(String(init?.body))).toEqual({
      task: "nestlume.study.answer",
      input: "hello",
      context: { organizationId: "org-1" },
    });
    fetchMock.mockRestore();
  });
});
