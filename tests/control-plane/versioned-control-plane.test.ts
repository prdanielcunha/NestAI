import { describe, expect, it } from "vitest";
import {
  validatePromptDraft,
  validateRouteDraft,
  validatePolicyDraft,
  applyActiveRoutePreference,
  applyActivePolicyOverlay,
  getActivePromptOverride,
} from "../../packages/control-plane/src/index.js";
import { buildTaskPrompt } from "../../packages/prompt-registry/src/index.js";
import type { D1DatabaseLike } from "../../packages/usage-ledger/src/index.js";

function dbReturning(row: Record<string, unknown> | null) {
  return {
    prepare() {
      return {
        bind() { return this; },
        async first() { return row; },
      };
    },
  } as unknown as D1DatabaseLike;
}

describe("versioned control-plane safety", () => {
  it("allows only providers already authorized by the canonical task", () => {
    expect(validateRouteDraft("connect.reply.suggest", { providerOrder: ["cloudflare","groq"] }))
      .toEqual({ providerOrder: ["cloudflare","groq"] });
    expect(() => validateRouteDraft("finance.report.explain", { providerOrder: ["gemini"] }))
      .toThrow("CONTROL_PLANE_ROUTE_PROVIDER_DENIED");
    expect(() => validateRouteDraft("connect.reply.suggest", { providerOrder: ["mistral"] }))
      .toThrow("CONTROL_PLANE_ROUTE_PROVIDER_DENIED");
  });

  it("lets policy overlays block known providers but never invent providers", () => {
    expect(validatePolicyDraft({ extraBlockedProviders: ["groq","gemini","groq"] }))
      .toEqual({ extraBlockedProviders: ["groq","gemini"] });
    expect(() => validatePolicyDraft({ extraBlockedProviders: ["paid-magic-provider"] }))
      .toThrow("CONTROL_PLANE_POLICY_PROVIDER_INVALID");
  });

  it("preserves the immutable system policy when prompt instructions are overridden", () => {
    const draft = validatePromptDraft("connect.reply.suggest", {
      instructions: { "pt-BR": "Escreva uma resposta sintética e revisável." },
    });
    const prompt = buildTaskPrompt({
      taskId: "connect.reply.suggest",
      locale: "pt-BR",
      input: "Olá",
      instructionsOverride: draft.instructions,
      promptVersionOverride: 1000,
    });
    expect(prompt.promptVersion).toBe(1000);
    expect(prompt.messages[0]?.content).toContain("Never reveal secrets");
    expect(prompt.messages[0]?.content).toContain("Escreva uma resposta sintética e revisável.");
  });

  it("reorders only already-safe candidates", async () => {
    const db = dbReturning({ config_json: JSON.stringify({ providerOrder: ["cloudflare","groq"] }) });
    const candidates = [
      { provider: "groq", id: "g" },
      { provider: "cloudflare", id: "c" },
    ];
    await expect(applyActiveRoutePreference(db, "connect.reply.suggest", candidates))
      .resolves.toEqual([{ provider: "cloudflare", id: "c" }, { provider: "groq", id: "g" }]);
  });

  it("applies a restrictive policy overlay only by filtering candidates", async () => {
    const db = dbReturning({ config_json: JSON.stringify({ extraBlockedProviders: ["groq"] }) });
    const candidates = [
      { provider: "groq", id: "g" },
      { provider: "cloudflare", id: "c" },
    ];
    await expect(applyActivePolicyOverlay(db, candidates))
      .resolves.toEqual([{ provider: "cloudflare", id: "c" }]);
  });

  it("resolves only validated promoted prompt overrides", async () => {
    const db = dbReturning({
      version: 1002,
      content_json: JSON.stringify({ instructions: { en: "Draft a reviewable answer." } }),
    });
    await expect(getActivePromptOverride(db, "connect.reply.suggest")).resolves.toEqual({
      version: 1002,
      instructions: { en: "Draft a reviewable answer." },
    });
  });
});
