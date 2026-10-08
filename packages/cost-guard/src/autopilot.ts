import { providerFreeQuota } from "./index.js";

// Advisory only. Never changes routing, bills, or invokes providers.
// Usage is strictly global provider-level; never sum org/task dimensions.
export type FreeCapacityUsage = {
  scope_type: string;
  scope_id?: string;
  provider: string;
  task: string;
  provider_calls: number;
};
export type FreeProviderHealth = {
  provider_id: string;
  state: string;
  success_rate: number | null;
  p95_ms: number | null;
  checked_at: string | null;
};
export type FreeCapacityAdvice = {
  provider: string;
  usageCalls: number;
  freeHardLimit: number;
  sharedLimit: number;
  remaining: number;
  health: "healthy" | "watch" | "degraded" | "critical" | "unverified";
  quota: "healthy" | "watch" | "reserve" | "exhausted";
  recommendation: "continue_monitoring" | "validate_health" | "defer_background" | "stop_at_free_limit";
  reason: string;
  advisoryOnly: true;
  automaticRerouting: false;
  paidFallback: false;
};

export function freeCapacityAdvice(
  usage: FreeCapacityUsage[],
  health: FreeProviderHealth[],
  now = new Date(),
): FreeCapacityAdvice[] {
  const currentTime = now.getTime();
  return Object.entries(providerFreeQuota).map(([provider, policy]) => {
    const rows = usage.filter(row => row.provider === provider &&
      row.scope_type === "provider" && row.task === "*" && row.scope_id === provider);
    const used = Math.max(0, rows.reduce((sum, row) => sum + (Number.isFinite(Number(row.provider_calls)) ?
      Math.max(0, Math.floor(Number(row.provider_calls))) : 0), 0));
    const hardLimit = Math.max(0, Math.floor(policy.hardDailyRequests));
    const sharedLimit = Math.floor(hardLimit * policy.sharedFraction);
    const remaining = Math.max(0, hardLimit - used);
    const quota: FreeCapacityAdvice["quota"] =
      used >= hardLimit ? "exhausted" :
      used >= sharedLimit ? "reserve" :
      used >= hardLimit * 0.6 ? "watch" : "healthy";

    const sample = health.find(row => row.provider_id === provider);
    const sampleTime = sample?.checked_at ? Date.parse(sample.checked_at) : NaN;
    const fresh = Number.isFinite(sampleTime) && sampleTime <= currentTime &&
      currentTime - sampleTime <= 6 * 60 * 60 * 1000;
    const healthState = sample?.state;
    const checkedHealth: FreeCapacityAdvice["health"] =
      fresh && ["healthy", "watch", "degraded", "critical"].includes(healthState ?? "")
        ? healthState as FreeCapacityAdvice["health"] : "unverified";
    const recommendation: FreeCapacityAdvice["recommendation"] =
      quota === "exhausted" ? "stop_at_free_limit" :
      quota === "reserve" ? "defer_background" :
      checkedHealth === "unverified" || checkedHealth === "critical" || checkedHealth === "degraded"
        ? "validate_health" : "continue_monitoring";
    const reason =
      quota === "exhausted" ? "Hard FREE_ONLY daily request ceiling reached" :
      quota === "reserve" ? "Preserve the protected interactive quota; pause background tasks" :
      checkedHealth === "unverified" ? "No fresh provider health sample; no reliability claim" :
      checkedHealth === "critical" || checkedHealth === "degraded" ? "Reliability needs review" :
      "Within conservative quota and health evidence thresholds";

    return {
      provider, usageCalls: used, freeHardLimit: hardLimit, sharedLimit, remaining,
      health: checkedHealth, quota, recommendation, reason,
      advisoryOnly: true, automaticRerouting: false, paidFallback: false,
    };
  });
}
