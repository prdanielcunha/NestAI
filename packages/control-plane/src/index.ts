import { ecosystemApps } from "../../app-registry/src/index.js";
import { tasks } from "../../task-registry/src/index.js";
import { models } from "../../model-registry/src/index.js";
import { providers } from "../../provider-registry/src/index.js";
import { providerFreeQuota, quotaHealth } from "../../cost-guard/src/index.js";
import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

function utcDay(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

async function scalar(db: D1DatabaseLike, sql: string, ...bindings: unknown[]): Promise<number> {
  const row = await db.prepare(sql).bind(...bindings).first<Record<string, unknown>>();
  const value = row ? Object.values(row)[0] : 0;
  return Number(value ?? 0);
}

export async function buildMissionControlOverview(db: D1DatabaseLike, now = new Date()) {
  const day = utcDay(now);
  const [requestsToday, privacyRejected, rateLimited, providerRows] = await Promise.all([
    scalar(db, "SELECT COALESCE(SUM(provider_calls),0) AS value FROM daily_usage_dimensions WHERE day = ?1 AND scope_type = 'provider' AND task = '*'", day),
    scalar(db, "SELECT COUNT(*) AS value FROM runtime_events WHERE day = ?1 AND event_type = 'privacy_rejected'", day),
    scalar(db, "SELECT COUNT(*) AS value FROM runtime_events WHERE day = ?1 AND event_type = 'rate_limited'", day),
    db.prepare(
      "SELECT provider AS provider, SUM(provider_calls) AS calls FROM daily_usage_dimensions WHERE day = ?1 AND scope_type = 'provider' AND task = '*' GROUP BY provider"
    ).bind(day).all<{ provider: string; calls: number }>(),
  ]);

  const providerUsage = Object.fromEntries((providerRows.results ?? []).map((row) => {
    const policy = providerFreeQuota[row.provider];
    const hardLimit = policy?.hardDailyRequests ?? 0;
    const remainingFraction = hardLimit > 0 ? Math.max(0, hardLimit - Number(row.calls)) / hardLimit : 0;
    return [row.provider, {
      calls: Number(row.calls),
      hardLimit,
      remaining: Math.max(0, hardLimit - Number(row.calls)),
      quotaHealth: policy ? quotaHealth(remainingFraction) : "EXHAUSTED",
    }];
  }));

  return {
    generatedAt: now.toISOString(),
    requestsToday,
    privacyRejected,
    rateLimited,
    appsEnabled: ecosystemApps.filter((app) => app.enabled).length,
    tasksEnabled: tasks.length,
    providerUsage,
    paidSpendBrl: 0,
    billingMode: "FREE_ONLY" as const,
  };
}

export function controlPlaneApps() {
  return ecosystemApps.map((app) => ({
    ...app,
    taskCount: app.allowedTasks.length,
  }));
}

export function controlPlaneTasks() {
  return tasks.map((task) => ({
    ...task,
    structuredOutput: task.id === "finance.receipt.extract" || task.id === "affiliate.pin.copy",
  }));
}

export function controlPlaneProviders() {
  return Object.values(providers).map((provider) => ({
    ...provider,
    models: Object.entries(models)
      .filter(([, model]) => model.provider === provider.id)
      .map(([id, model]) => ({ id, ...model })),
  }));
}

export function controlPlanePolicies() {
  return {
    billingMode: "FREE_ONLY",
    paidProvidersLocked: true,
    dataClasses: {
      P0_PUBLIC: { external: "allowed" },
      P1_INTERNAL: { external: "policy_controlled" },
      P2_PERSONAL: { external: "restricted" },
      P3_SENSITIVE: { external: "restricted" },
      P4_RESTRICTED: { external: "blocked" },
    },
    providerMaxSensitivity: Object.fromEntries(
      Object.values(providers).map((provider) => [provider.id, provider.maxSensitivity]),
    ),
  };
}

export async function controlPlaneAudit(db: D1DatabaseLike, limit = 100) {
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit)));
  const rows = await db.prepare(
    "SELECT event_id, actor_hash, action, resource_type, resource_id, environment, metadata_json, created_at FROM cp_audit_events ORDER BY created_at DESC LIMIT ?1"
  ).bind(safeLimit).all<Record<string, unknown>>();
  return rows.results ?? [];
}
