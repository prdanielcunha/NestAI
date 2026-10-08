import { describe, expect, it } from "vitest";
import { assertEvalTargetAllowed, evalTargets } from "../../packages/evaluation-lab/src/index.js";
import { assertFreeSyntheticEvalInput } from "../../packages/evaluation-lab/src/free-only-eval.js";
import { models } from "../../packages/model-registry/src/index.js";
import { routeCandidates } from "../../packages/router/src/index.js";

describe("free candidate live-evaluation guard", () => {
  for (const id of ["groq:gpt-oss-safeguard-20b", "gemini:3.7-flash"]) {
    it("recognizes " + id + " as candidate without production traffic", () => {
      const model = models[id as keyof typeof models];
      expect(model.status).toBe("preview");
      expect(model.customerTrafficAllowed).toBe(false);
      expect(model.productionTrafficAllowed).toBe(false);
      expect(evalTargets[id]?.customerTrafficAllowed).toBe(false);
      expect(evalTargets[id]?.productionTrafficAllowed).toBe(false);
      expect(assertEvalTargetAllowed({
        targetId: id, sensitivity: "P0_PUBLIC", sanitized: true,
      }).id).toBe(id);
      const routes = routeCandidates({
        sensitivity: "P0_PUBLIC", billingMode: "FREE_ONLY", modality: "text",
        allowedProviders: ["groq", "cloudflare", "gemini"], blockedProviders: [],
        executionMode: "customer", allowPreviewModels: true,
      });
      expect(routes.map(route => route.modelId)).not.toContain(id);
    });
  }

  it("accepts public synthetic text for Gemini", () => {
    expect(() => assertFreeSyntheticEvalInput(evalTargets["gemini:3.7-flash"]!, {
      sanitized: true, sensitivity: "P0_PUBLIC",
      prompt: "Classifique a expressão matemática 2 + 2 e responda em português.",
    })).not.toThrow();
  });

  it("refuses P1 on Gemini Free and all real personal data markers", () => {
    const gemini = evalTargets["gemini:3.7-flash"]!;
    const safeguard = evalTargets["groq:gpt-oss-safeguard-20b"]!;
    expect(() => assertFreeSyntheticEvalInput(gemini, {
      sanitized: true, sensitivity: "P1_INTERNAL", prompt: "Internal synthetic example",
    })).toThrow("EVAL_GEMINI_PUBLIC_ONLY");
    for (const fixture of ["cliente@teste.com", "CPF 123.456.789-00",
      "api_key: abcdef1234567890", "+55 43 99999-9999"]) {
      expect(() => assertFreeSyntheticEvalInput(safeguard, {
        sanitized: true, sensitivity: "P0_PUBLIC", prompt: fixture,
      })).toThrow("EVAL_FIXTURE_PRIVATE_CONTENT_DENIED");
    }
  });
  it("denies unsanitized and large requests", () => {
    const safeguard = evalTargets["groq:gpt-oss-safeguard-20b"]!;
    expect(() => assertFreeSyntheticEvalInput(safeguard, {
      sanitized: false, sensitivity: "P0_PUBLIC", prompt: "test",
    })).toThrow("EVAL_TARGET_REQUIRES_SANITIZED_INPUT");
    expect(() => assertFreeSyntheticEvalInput(safeguard, {
      sanitized: true, sensitivity: "P0_PUBLIC", prompt: "a".repeat(1501),
    })).toThrow("EVAL_FIXTURE_SIZE_INVALID");
  });
});
