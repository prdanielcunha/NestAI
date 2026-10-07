import { describe, expect, it } from "vitest";
import { models } from "../../packages/model-registry/src/index.js";
import { routeCandidates } from "../../packages/router/src/index.js";

const candidateIds = [
  "groq:gpt-oss-safeguard-20b",
  "gemini:3.7-flash",
  "gemini:3.8-flash-lite-tts",
] as const;

describe("2026 free-model research gate", () => {
  it("keeps all new models evaluation-only, without customer or production access", () => {
    for (const id of candidateIds) {
      const model = models[id];
      expect(model.status).toBe("preview");
      expect(model.freeEligible).toBe(true);
      expect(model.paidRequired).toBe(false);
      expect(model.promotionStage).toBe("candidate");
      expect(model.evalOnly).toBe(true);
      expect(model.customerTrafficAllowed).toBe(false);
      expect(model.productionTrafficAllowed).toBe(false);
      expect(model.reviewedAt).toBe("2026-10-07");
    }
  });

  it("never selects research models for FREE_ONLY customers, even when previews are requested", () => {
    for (const modality of ["text", "vision", "audio", "image", "embedding"] as const) {
      const routes = routeCandidates({
        sensitivity: "P0_PUBLIC",
        billingMode: "FREE_ONLY",
        modality,
        allowedProviders: ["groq", "cloudflare", "gemini"],
        blockedProviders: [],
        allowPreviewModels: true,
        executionMode: "customer",
      });
      for (const id of candidateIds) {
        expect(routes.some(route => route.modelId === id)).toBe(false);
      }
      expect(routes.every(route => route.modelId in models)).toBe(true);
    }
  });

  it("does not accidentally treat text-to-speech as an existing transcription adapter", () => {
    expect(models["gemini:3.8-flash-lite-tts"].audioOut).toBe(true);
    const routes = routeCandidates({
      sensitivity: "P0_PUBLIC",
      billingMode: "FREE_ONLY",
      modality: "audio",
      allowedProviders: ["gemini"],
      blockedProviders: [],
      allowPreviewModels: true,
      executionMode: "eval",
    });
    expect(routes.some(route => route.modelId === "gemini:3.8-flash-lite-tts")).toBe(false);
  });

  it("separates safety moderation from the deterministic DLP and auth policy", () => {
    expect(models["groq:gpt-oss-safeguard-20b"].safetyClassifier).toBe(true);
    expect(models["groq:gpt-oss-safeguard-20b"].evalOnly).toBe(true);
  });
});
