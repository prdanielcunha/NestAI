export type CostState = {
  requestsToday: number;
  providerCallsToday: number;
  neuronsToday?: number;
};

export type CostLimits = {
  maxRequestsPerDay: number;
  maxProviderCallsPerDay: number;
  maxNeuronsPerDay?: number;
};

export type QuotaHealth = "HEALTHY" | "WATCH" | "CONSERVE" | "CRITICAL" | "EXHAUSTED";
export type WorkPriority = "background" | "interactive" | "critical";

export type FreeQuotaPolicy = {
  hardDailyRequests: number;
  sharedFraction: number;
  reserveFraction: number;
  reviewedAt?: string;
  sourceUrl?: string;
};

export type QuotaDecision = {
  health: QuotaHealth;
  used: number;
  hardLimit: number;
  sharedLimit: number;
  remaining: number;
  remainingFraction: number;
  reserveOnly: boolean;
};

export const providerFreeQuota: Record<string, FreeQuotaPolicy> = {
  groq: { hardDailyRequests: 1000, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://console.groq.com/docs/rate-limits" },
  cloudflare: { hardDailyRequests: 900, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/" },
  gemini: { hardDailyRequests: 500, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://ai.google.dev/gemini-api/docs/rate-limits" },
};

export const modelFreeQuota: Record<string, FreeQuotaPolicy> = {
  "groq:gpt-oss-120b": { hardDailyRequests: 1000, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://console.groq.com/docs/rate-limits" },
  "groq:gpt-oss-20b": { hardDailyRequests: 1000, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://console.groq.com/docs/rate-limits" },
  "groq:qwen3.8-27b": { hardDailyRequests: 1000, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://console.groq.com/docs/rate-limits" },
  "groq:prompt-guard-2-86m": { hardDailyRequests: 14400, sharedFraction: 0.8, reserveFraction: 0.2, reviewedAt: "2026-10-07", sourceUrl: "https://console.groq.com/docs/rate-limits" },
};

export function quotaHealth(remainingFraction: number): QuotaHealth {
  if (remainingFraction <= 0) return "EXHAUSTED";
  if (remainingFraction < 0.05) return "CRITICAL";
  if (remainingFraction < 0.20) return "CONSERVE";
  if (remainingFraction <= 0.40) return "WATCH";
  return "HEALTHY";
}

export function evaluateQuota(
  used: number,
  policy: FreeQuotaPolicy,
  priority: WorkPriority = "interactive",
): QuotaDecision {
  const hardLimit = Math.max(0, Math.floor(policy.hardDailyRequests));
  const sharedLimit = Math.floor(hardLimit * policy.sharedFraction);
  const remaining = Math.max(0, hardLimit - used);
  const remainingFraction = hardLimit === 0 ? 0 : remaining / hardLimit;
  const reserveOnly = used >= sharedLimit;

  if (used >= hardLimit) throw new Error("COST_GUARD_PROVIDER_LIMIT");
  if (reserveOnly && priority === "background") throw new Error("COST_GUARD_RESERVE_PROTECTED");

  return {
    health: quotaHealth(remainingFraction),
    used,
    hardLimit,
    sharedLimit,
    remaining,
    remainingFraction,
    reserveOnly,
  };
}

export function assertProviderFreeQuota(
  provider: string,
  used: number,
  priority: WorkPriority = "interactive",
): QuotaDecision {
  const policy = providerFreeQuota[provider];
  if (!policy) throw new Error("COST_GUARD_PROVIDER_NOT_FREE");
  return evaluateQuota(used, policy, priority);
}

export function assertModelFreeQuota(
  modelId: string,
  used: number,
  priority: WorkPriority = "interactive",
): QuotaDecision {
  const policy = modelFreeQuota[modelId];
  if (!policy) throw new Error("COST_GUARD_MODEL_NOT_REVIEWED");
  return evaluateQuota(used, policy, priority);
}

export function assertWithinFreeBudget(state: CostState, limits: CostLimits): void {
  if (state.requestsToday >= limits.maxRequestsPerDay) throw new Error("COST_GUARD_REQUEST_LIMIT");
  if (state.providerCallsToday >= limits.maxProviderCallsPerDay) throw new Error("COST_GUARD_PROVIDER_LIMIT");
  if (limits.maxNeuronsPerDay !== undefined && state.neuronsToday !== undefined && state.neuronsToday >= limits.maxNeuronsPerDay) {
    throw new Error("COST_GUARD_NEURON_LIMIT");
  }
}
