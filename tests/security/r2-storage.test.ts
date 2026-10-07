import { describe, expect, it } from "vitest";
import { R2_EFFECTIVE_BUDGET, R2_NESTAI_ACCOUNT_SHARE, R2_SAFETY, assertR2Capacity, r2Utf8Size, type R2UsageSnapshot } from "../../packages/r2-storage/src/index.js";

function snapshot(overrides: Partial<R2UsageSnapshot> = {}): R2UsageSnapshot {
  return {
    month: "2026-10",
    storageBytes: 0,
    classAOps: 0,
    classBOps: 0,
    storageFraction: 0,
    classAFraction: 0,
    classBFraction: 0,
    highestFraction: 0,
    health: "HEALTHY",
    ...overrides,
  };
}

describe("R2 zero-cost guard", () => {
  it("allows background work below conserve threshold", () => {
    expect(() => assertR2Capacity(snapshot({
      storageBytes: Math.floor(R2_EFFECTIVE_BUDGET.storageBytes * 0.40),
    }), { storageBytes: 1024 }, "background")).not.toThrow();
  });

  it("blocks background writes at the 60% conserve margin", () => {
    expect(() => assertR2Capacity(snapshot({
      storageBytes: Math.floor(R2_EFFECTIVE_BUDGET.storageBytes * R2_SAFETY.conserveFraction),
    }), { storageBytes: 1 }, "background")).toThrow("R2_CONSERVE_BLOCK");
  });

  it("blocks interactive work before the billing edge at 70%", () => {
    expect(() => assertR2Capacity(snapshot({
      classAOps: Math.floor(R2_EFFECTIVE_BUDGET.classAOps * R2_SAFETY.blockFraction),
    }), { classAOps: 1 }, "interactive")).toThrow("R2_PREBILL_BLOCK");
  });

  it("hard-locks even critical work at 80%", () => {
    expect(() => assertR2Capacity(snapshot({
      classBOps: Math.floor(R2_EFFECTIVE_BUDGET.classBOps * R2_SAFETY.hardLockFraction),
    }), { classBOps: 1 }, "critical")).toThrow("R2_HARD_LOCK");
  });

  it("counts UTF-8 bytes instead of JavaScript characters", () => {
    expect(r2Utf8Size("ação")).toBeGreaterThan("ação".length);
  });


  it("reserves only a conservative fraction of the account-wide free tier", () => {
    expect(R2_NESTAI_ACCOUNT_SHARE).toBeLessThanOrEqual(0.20);
    expect(R2_EFFECTIVE_BUDGET.storageBytes).toBe(2_000_000_000);
    expect(R2_EFFECTIVE_BUDGET.classAOps).toBe(200_000);
    expect(R2_EFFECTIVE_BUDGET.classBOps).toBe(2_000_000);
  });
});
