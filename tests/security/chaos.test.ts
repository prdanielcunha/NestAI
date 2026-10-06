import { describe, expect, it } from "vitest";
import { CircuitBreaker, executeWithSafeFallback } from "../../packages/resilience/src/index.js";
import { assertProviderFreeQuota, evaluateQuota } from "../../packages/cost-guard/src/index.js";
import { validateStructuredText } from "../../packages/structured-output/src/index.js";

describe("production chaos invariants", () => {
  it("falls back after provider 429 without leaving the candidate list", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, openMs: 1000 });
    const result = await executeWithSafeFallback({
      candidates: ["groq-free", "cloudflare-free"],
      keyOf: (candidate) => candidate,
      breaker,
      maxRetriesPerCandidate: 0,
      execute: async ({ candidate }) => {
        if (candidate === "groq-free") throw new Error("PROVIDER_GROQ_HTTP_429");
        return "safe-free-result";
      },
    });
    expect(result.result).toBe("safe-free-result");
    expect(result.candidate).toBe("cloudflare-free");
    expect(result.fallbackUsed).toBe(true);
  });

  it("fails closed when all free candidates have capacity errors", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, openMs: 1000 });
    await expect(executeWithSafeFallback({
      candidates: ["free-a", "free-b"],
      keyOf: (candidate) => candidate,
      breaker,
      maxRetriesPerCandidate: 0,
      execute: async () => { throw new Error("PROVIDER_CAPACITY"); },
    })).rejects.toThrow("PROVIDER_CAPACITY");
  });

  it("protects the reserve from background work and exhausts at the hard limit", () => {
    expect(() => evaluateQuota(801, {
      hardDailyRequests: 1000,
      sharedFraction: 0.8,
      reserveFraction: 0.2,
    }, "background")).toThrow("COST_GUARD_RESERVE_PROTECTED");

    expect(() => assertProviderFreeQuota("groq", 1000, "critical")).toThrow("COST_GUARD_PROVIDER_LIMIT");
  });

  it("rejects invalid structured output instead of forwarding it", () => {
    expect(() => validateStructuredText("affiliate.pin.copy", '{"title":"x"}'))
      .toThrow("OUTPUT_SCHEMA_VALIDATION_FAILED");
  });
});
