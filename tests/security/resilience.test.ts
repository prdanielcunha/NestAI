import { describe, expect, it } from "vitest";
import { CircuitBreaker, executeWithSafeFallback } from "../../packages/resilience/src/index.js";

describe("provider resilience", () => {
  it("retries transient failures then falls back safely", async () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 1000 });
    const seen: string[] = [];
    const execution = await executeWithSafeFallback({
      candidates: ["groq", "cloudflare"],
      keyOf: (candidate) => candidate,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate, retry }) => {
        seen.push(candidate + ":" + retry);
        if (candidate === "groq") throw new Error("PROVIDER_GROQ_HTTP_503");
        return "ok";
      },
    });
    expect(execution.result).toBe("ok");
    expect(execution.candidate).toBe("cloudflare");
    expect(execution.fallbackUsed).toBe(true);
    expect(seen).toEqual(["groq:0", "groq:1", "cloudflare:0"]);
  });

  it("does not fallback on permanent provider errors", async () => {
    const breaker = new CircuitBreaker();
    await expect(executeWithSafeFallback({
      candidates: ["a", "b"],
      keyOf: (candidate) => candidate,
      breaker,
      execute: async () => { throw new Error("PROVIDER_BAD_REQUEST_400"); },
    })).rejects.toThrow("PROVIDER_BAD_REQUEST_400");
  });

  it("opens and half-opens a failing circuit", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 2, openMs: 100 });
    breaker.recordFailure("groq", 1000);
    expect(breaker.snapshot("groq", 1000).state).toBe("CLOSED");
    breaker.recordFailure("groq", 1010);
    expect(breaker.snapshot("groq", 1010).state).toBe("OPEN");
    expect(breaker.canAttempt("groq", 1050)).toBe(false);
    expect(breaker.snapshot("groq", 1111).state).toBe("HALF_OPEN");
  });
});
