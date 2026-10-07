import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateWithGemini,
  generateWithGroq,
  generateWithMistral,
  probeGemini,
  probeGroq,
  probeMistral,
} from "../../packages/providers/src/index.js";
import type { RouteDecision } from "../../packages/router/src/index.js";

afterEach(() => vi.restoreAllMocks());

function route(provider: RouteDecision["provider"], providerModelId: string): RouteDecision {
  return {
    modelId: (provider === "groq" ? "groq:gpt-oss-20b" : provider === "gemini" ? "gemini:2.5-flash-lite" : "mistral:small-2603") as RouteDecision["modelId"],
    provider,
    providerModelId,
    reason: ["test"],
  };
}

describe("provider adapters", () => {
  it("calls Groq using the OpenAI-compatible contract and schema mode", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 2, completion_tokens: 3 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await generateWithGroq("key", {
      route: route("groq", "openai/gpt-oss-20b"),
      messages: [{ role: "user", content: "test" }],
      responseSchema: { type: "object" },
    });
    expect(result.text).toBe('{"ok":true}');
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body.response_format.type).toBe("json_schema");
  });

  it("calls Gemini generateContent with JSON response schema", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }],
      usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await generateWithGemini("key", {
      route: route("gemini", "gemini-2.5-flash-lite"),
      messages: [{ role: "system", content: "policy" }, { role: "user", content: "test" }],
      responseSchema: { type: "object" },
    });
    expect(result.text).toBe('{"ok":true}');
    const init = fetchMock.mock.calls[0]?.[1];
    const body = JSON.parse(String(init?.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
  });

  it("calls Mistral through its chat completion contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
      usage: { prompt_tokens: 2, completion_tokens: 1 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await generateWithMistral("key", {
      route: route("mistral", "mistral-small-2603"),
      messages: [{ role: "user", content: "test" }],
    });
    expect(result.text).toBe("ok");
    expect(result.provider).toBe("mistral");
  });
});


describe("provider credential probes", () => {
  it("verifies Groq key and target model without inference", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [{ id: "openai/gpt-oss-20b" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const result = await probeGroq("key");
    expect(result.state).toBe("ready");
    expect(result.modelAccess).toBe(true);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/models");
  });

  it("verifies Gemini key and target model without inference", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({
        models: [{ name: "models/gemini-3.5-flash-lite" }],
      }), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const result = await probeGemini("key");
    expect(result.state).toBe("ready");
    expect(result.modelAccess).toBe(true);
  });

  it("verifies Mistral Free-mode inference entitlement with a one-token probe", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [{ id: "mistral-small-2603", aliases: ["mistral-small-latest"] }],
        }), { status: 200, headers: { "content-type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          choices: [{ message: { content: "O" } }],
        }), { status: 200, headers: { "content-type": "application/json" } }),
      );

    const result = await probeMistral("key");
    expect(result.state).toBe("ready");
    expect(result.modelAccess).toBe(true);
    expect(result.inferenceAccess).toBe(true);

    const inferenceInit = fetchMock.mock.calls[1]?.[1];
    const body = JSON.parse(String(inferenceInit?.body));
    expect(body.max_tokens).toBe(1);
  });

  it("reports a Mistral plan block without leaking provider response bodies", async () => {
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({
          data: [{ id: "mistral-small-2603" }],
        }), { status: 200, headers: { "content-type": "application/json" } }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "upgrade required" }), {
          status: 403,
          headers: { "content-type": "application/json" },
        }),
      );
    const result = await probeMistral("key");
    expect(result.state).toBe("plan_blocked");
    expect(result.httpStatus).toBe(403);
    expect(result.code).toBe("PROVIDER_MISTRAL_INFERENCE_HTTP_403");
    expect(JSON.stringify(result)).not.toContain("upgrade required");
  });
});
