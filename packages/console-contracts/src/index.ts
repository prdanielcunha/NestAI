export type HealthSnapshot = {
  service: "nestai";
  billingMode: "FREE_ONLY";
  providers: Record<string, "ready" | "unconfigured" | "degraded">;
  productionDeployed: boolean;
  releaseSha?: string;
};

export type MissionControlSummary = {
  health: HealthSnapshot;
  requestsToday: number;
  rejectedPrivacyEventsToday: number;
  rateLimitedToday: number;
  appsEnabled: number;
};

export function productionBadge(snapshot: HealthSnapshot): "LIVE" | "NOT_DEPLOYED" {
  return snapshot.productionDeployed ? "LIVE" : "NOT_DEPLOYED";
}
