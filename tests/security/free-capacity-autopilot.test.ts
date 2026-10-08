import { describe, expect, it } from "vitest";
import { freeCapacityAdvice } from "../../packages/cost-guard/src/autopilot.js";

const now = new Date("2026-10-08T12:00:00Z");
const health = [{
  provider_id: "groq", state: "healthy", success_rate: 1, p95_ms: 200,
  checked_at: "2026-10-08T11:59:00Z",
}];
const usage = (provider_calls: number) => [{
  scope_type: "provider", scope_id: "groq", provider: "groq", task: "*", provider_calls,
}];

describe("FREE_ONLY capacity advisory", () => {
  it("lists reviewed free providers without claiming unmeasured health", () => {
    const report = freeCapacityAdvice([], [], now);
    expect(report.map(x => x.provider)).toEqual(expect.arrayContaining(["groq", "cloudflare", "gemini"]));
    expect(report.every(x => x.health === "unverified")).toBe(true);
    expect(report.every(x => x.advisoryOnly && !x.automaticRerouting && !x.paidFallback)).toBe(true);
    expect(report.every(x => x.recommendation === "validate_health")).toBe(true);
  });
  it("reports healthy only with a fresh and valid provider sample", () => {
    const [candidate] = freeCapacityAdvice(usage(3), health, now);
    expect(candidate).toMatchObject({ provider: "groq", health: "healthy", quota: "healthy",
      recommendation: "continue_monitoring", usageCalls: 3 });
  });
  it("never double-counts organization, task or user dimensions", () => {
    const rows = [...usage(2),
      {scope_type:"organization",scope_id:"o1",provider:"groq",task:"*",provider_calls:900},
      {scope_type:"provider",scope_id:"groq",provider:"groq",task:"other",provider_calls:900}];
    expect(freeCapacityAdvice(rows, health, now)[0]?.usageCalls).toBe(2);
  });
  it("protects 20-percent reserve instead of enabling additional background work", () => {
    const candidate = freeCapacityAdvice(usage(800), health, now)[0];
    expect(candidate).toMatchObject({quota:"reserve",recommendation:"defer_background",remaining:200});
  });
  it("stops recommendations at the hard limit without suggesting paid fallback", () => {
    const candidate = freeCapacityAdvice(usage(1000), health, now)[0];
    expect(candidate).toMatchObject({quota:"exhausted",recommendation:"stop_at_free_limit",remaining:0,paidFallback:false});
  });
  it("does not trust stale, future, malformed or absent health samples", () => {
    for (const checked_at of ["2026-10-07T00:00:00Z", "2026-10-09T00:00:00Z", "invalid", null]) {
      const state = freeCapacityAdvice(usage(2), [{...health[0]!, checked_at}], now)[0];
      expect(state?.health).toBe("unverified");
      expect(state?.recommendation).toBe("validate_health");
    }
  });
  it("reports degraded reliability without ever changing the routing decision", () => {
    const state = freeCapacityAdvice(usage(1), [{...health[0]!, state:"degraded"}], now)[0];
    expect(state).toMatchObject({health:"degraded",recommendation:"validate_health",automaticRerouting:false});
  });
});
