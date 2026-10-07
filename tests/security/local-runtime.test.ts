import { describe, expect, it } from "vitest";
import {
  localCapabilityEligible,
  normalizeTextLocally,
  preDetectPiiLocally,
  runLocalFirst,
  type LocalAiAdapter,
} from "../../packages/local-runtime/src/index.js";

describe("local AI runtime foundation", () => {
  const adapter: LocalAiAdapter = {
    capabilities: ["classification","normalization","pii_predetection"],
    async run(_capability, input) {
      return { local: true, input };
    },
  };

  it("uses local execution when supported and enabled", async () => {
    expect(localCapabilityEligible({
      enabled: true,
      capability: "classification",
      adapter,
      support: { browser: true, webgpu: true, wasm: true },
    })).toBe(true);
  });

  it("falls back to remote when local execution fails for non-P4 data", async () => {
    const failing: LocalAiAdapter = {
      capabilities: ["classification"],
      async run() { throw new Error("gpu lost"); },
    };
    const result = await runLocalFirst({
      enabled: true,
      capability: "classification",
      sensitivity: "P1_INTERNAL",
      adapter: failing,
      input: "hello",
      remote: async () => "remote-ok",
    });
    expect(result).toEqual({ result: "remote-ok", execution: "remote", degraded: true });
  });

  it("never sends P4 to remote fallback", async () => {
    let remoteCalled = false;
    await expect(runLocalFirst({
      enabled: false,
      capability: "classification",
      sensitivity: "P4_RESTRICTED",
      adapter: null,
      input: "restricted",
      remote: async () => { remoteCalled = true; return "bad"; },
    })).rejects.toThrow("LOCAL_AI_REQUIRED_FOR_P4");
    expect(remoteCalled).toBe(false);
  });

  it("normalizes text and pre-detects common PII locally", () => {
    expect(normalizeTextLocally("  João\n  Silva ")).toBe("João Silva");
    const pii = preDetectPiiLocally("Contato joao@example.com e CPF 123.456.789-00");
    expect(pii.detected).toBe(true);
    expect(pii.types).toContain("email");
    expect(pii.types).toContain("cpf");
  });
});
