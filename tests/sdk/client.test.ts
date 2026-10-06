import { describe, expect, it, vi } from "vitest";
import { NestAiClient } from "../../packages/sdk/src/index.js";

describe("NestAI SDK", () => {
  it("sends canonical tenant app App Check and short-lived bearer headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      requestId: "req-1",
      task: "nestlume.study.answer",
      version: 1,
      result: "ok",
      meta: { providerClass: "free", cached: false, fallbackUsed: false, retries: 0 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const client = new NestAiClient({
      baseUrl: "https://ai.millionsnest.com/v1/",
      appId: "nestlume",
      organizationId: "org-1",
      locale: "pt-BR",
      getToken: async () => "short-lived-token",
      getAppCheckToken: async () => "app-check-token",
    });

    await expect(client.run({ task: "nestlume.study.answer", input: "hello" })).resolves.toMatchObject({ result: "ok" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("https://ai.millionsnest.com/v1/run");
    const headers = init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer short-lived-token");
    expect(headers["x-firebase-appcheck"]).toBe("app-check-token");
    expect(headers["x-millionsnest-app"]).toBe("nestlume");
    expect(JSON.parse(String(init?.body))).toEqual({
      task: "nestlume.study.answer",
      input: "hello",
      context: { organizationId: "org-1", locale: "pt-BR" },
    });
    fetchMock.mockRestore();
  });

  it("obtains and caches the NestAI token from the Hub", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/ai/token")) {
        return new Response(JSON.stringify({ token: "hub-token", expiresIn: 300 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({
        requestId: "req",
        task: "nestlume.study.answer",
        version: 1,
        result: "ok",
        meta: { providerClass: "free", cached: false, fallbackUsed: false, retries: 0 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    const client = new NestAiClient({
      appId: "nestlume",
      organizationId: "org-1",
      getFirebaseIdToken: async () => "firebase-id",
      getAppCheckToken: async () => "app-check",
      fetcher,
    });

    await client.run({ task: "nestlume.study.answer", input: "a" });
    await client.run({ task: "nestlume.study.answer", input: "b" });

    const hubCalls = (fetcher as unknown as ReturnType<typeof vi.fn>).mock.calls
      .filter(([url]) => String(url).includes("/api/v1/ai/token"));
    expect(hubCalls).toHaveLength(1);
  });

  it("parses canonical SSE events", async () => {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: start\ndata: {"requestId":"r","task":"connect.reply.suggest","version":1}\n\n'));
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"Olá"}\n\n'));
        controller.enqueue(encoder.encode('event: complete\ndata: {"requestId":"r"}\n\n'));
        controller.close();
      },
    });
    const fetcher = vi.fn(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    })) as unknown as typeof fetch;

    const client = new NestAiClient({
      appId: "connect",
      organizationId: "org-1",
      getToken: async () => "token",
      getAppCheckToken: async () => "app-check",
      fetcher,
    });

    const events = [];
    for await (const event of client.stream({ task: "connect.reply.suggest", input: "oi" })) {
      events.push(event);
    }
    expect(events.map((event) => event.event)).toEqual(["start", "delta", "complete"]);
  });
});
