import type { RouteDecision } from "../../router/src/index.js";

export type ProviderMessage = { role: "system" | "user" | "assistant"; content: string };
export type GenerateRequest = { route: RouteDecision; messages: ProviderMessage[]; maxTokens?: number };
export type GenerateResult = { text: string; provider: string; model: string; usage?: { inputTokens: number | undefined; outputTokens: number | undefined } };

export interface WorkersAiBinding {
  run(model: string, input: unknown, options?: unknown): Promise<unknown>;
}

export async function generateWithCloudflare(ai: WorkersAiBinding, request: GenerateRequest): Promise<GenerateResult> {
  const response = await ai.run(
    request.route.providerModelId,
    { messages: request.messages, max_tokens: request.maxTokens ?? 1024 },
    { gateway: { id: "default", collectLog: true } },
  ) as { response?: string; result?: { response?: string }; usage?: { prompt_tokens?: number; completion_tokens?: number } };

  const text = response.response ?? response.result?.response;
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "cloudflare",
    model: request.route.providerModelId,
    usage: { inputTokens: response.usage?.prompt_tokens, outputTokens: response.usage?.completion_tokens },
  };
}

export async function generateWithGroq(apiKey: string, request: GenerateRequest): Promise<GenerateResult> {
  if (!apiKey) throw new Error("PROVIDER_GROQ_KEY_MISSING");
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: request.route.providerModelId,
      messages: request.messages,
      max_completion_tokens: request.maxTokens ?? 1024,
      temperature: 0.2,
    }),
  });
  if (!response.ok) throw new Error(`PROVIDER_GROQ_HTTP_${response.status}`);
  const body = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("PROVIDER_EMPTY_RESPONSE");
  return {
    text,
    provider: "groq",
    model: request.route.providerModelId,
    usage: { inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens },
  };
}
