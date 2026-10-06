import { ecosystemApps } from "../../app-registry/src/index.js";
import { tasks } from "../../task-registry/src/index.js";
import { models } from "../../model-registry/src/index.js";
import { providers } from "../../provider-registry/src/index.js";
import { providerFreeQuota, quotaHealth } from "../../cost-guard/src/index.js";
import { routeCandidates } from "../../router/src/index.js";
import { prompts } from "../../prompt-registry/src/index.js";
import { getStructuredContract } from "../../structured-output/src/index.js";
import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";
import { buildSloSnapshot } from "../../observability/src/index.js";

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


export function controlPlaneRoutes() {
  return tasks.map((task) => {
    const candidates = routeCandidates({
      sensitivity: task.defaultSensitivity,
      billingMode: "FREE_ONLY",
      modality: task.modality,
      allowedProviders: task.allowedProviders,
      blockedProviders: task.blockedProviders,
      availableProviders: task.allowedProviders,
      needsStructuredOutput: getStructuredContract(task.id) !== null,
    });
    return {
      id: task.id + ":route",
      task: task.id,
      version: 1,
      sensitivity: task.defaultSensitivity,
      freeOnly: true,
      candidates,
      primary: candidates[0] ?? null,
      fallback: candidates[1] ?? null,
    };
  });
}

export function controlPlanePrompts() {
  return Object.values(prompts).map((prompt) => ({
    id: prompt.id,
    taskId: prompt.taskId,
    version: prompt.version,
    locales: Object.keys(prompt.instructions),
    hasStructuredOutput: getStructuredContract(prompt.taskId) !== null,
    systemPolicyPreview: prompt.systemPolicy.slice(0, 180),
  }));
}

export async function controlPlaneKnowledge(db: D1DatabaseLike) {
  const [sources, indexes] = await Promise.all([
    db.prepare(
      "SELECT source_id, app_id, organization_id_hash, sensitivity, locale, status, metadata_json, updated_at FROM cp_knowledge_sources ORDER BY updated_at DESC LIMIT 200"
    ).all<Record<string, unknown>>(),
    db.prepare(
      "SELECT index_id, source_id, version, status, chunks, metadata_json, updated_at FROM cp_knowledge_indexes ORDER BY updated_at DESC LIMIT 200"
    ).all<Record<string, unknown>>(),
  ]);
  return { sources: sources.results ?? [], indexes: indexes.results ?? [] };
}

export async function controlPlaneEvaluations(db: D1DatabaseLike) {
  const [suites, runs] = await Promise.all([
    db.prepare(
      "SELECT suite_id, task_id, name, status, updated_at FROM cp_eval_suites ORDER BY updated_at DESC LIMIT 100"
    ).all<Record<string, unknown>>(),
    db.prepare(
      "SELECT run_id, suite_id, target_json, score, passed, report_json, created_at FROM cp_eval_runs ORDER BY created_at DESC LIMIT 100"
    ).all<Record<string, unknown>>(),
  ]);
  return { suites: suites.results ?? [], runs: runs.results ?? [] };
}

export async function controlPlaneObservability(db: D1DatabaseLike, now = new Date()) {
  const day = utcDay(now);
  const [events, health, total, alerts, incidents, traces, slo] = await Promise.all([
    db.prepare(
      "SELECT id, event_type, app_id, provider, task, organization_hash, created_at FROM runtime_events WHERE day = ?1 ORDER BY created_at DESC LIMIT 200"
    ).bind(day).all<Record<string, unknown>>(),
    db.prepare(
      "SELECT provider_id, state, success_rate, p50_ms, p95_ms, circuit_state, checked_at FROM cp_provider_health ORDER BY provider_id"
    ).all<Record<string, unknown>>(),
    scalar(db, "SELECT COUNT(*) AS value FROM runtime_events WHERE day = ?1", day),
    db.prepare(
      "SELECT alert_id,alert_key,severity,status,message,metadata_json,first_seen_at,last_seen_at,resolved_at FROM cp_alerts ORDER BY last_seen_at DESC LIMIT 100"
    ).all<Record<string, unknown>>(),
    db.prepare(
      "SELECT incident_id,severity,status,title,provider_id,opened_at,resolved_at,metadata_json FROM cp_incidents ORDER BY opened_at DESC LIMIT 100"
    ).all<Record<string, unknown>>(),
    db.prepare(
      "SELECT trace_id,task,app_id,sensitivity,provider,model,duration_ms,ttft_ms,fallback_used,retries,cached,outcome,error_code,created_at FROM request_traces WHERE day=?1 ORDER BY created_at DESC LIMIT 200"
    ).bind(day).all<Record<string, unknown>>(),
    buildSloSnapshot(db,now),
  ]);
  return {
    day,
    totalEvents: total,
    events: events.results ?? [],
    traces: traces.results ?? [],
    providerHealth: health.results ?? [],
    alerts: alerts.results ?? [],
    incidents: incidents.results ?? [],
    slo,
  };
}

export async function controlPlaneCostQuota(db: D1DatabaseLike, now = new Date()) {
  const day = utcDay(now);
  const rows = await db.prepare(
    "SELECT scope_type, scope_id, provider, task, requests, provider_calls FROM daily_usage_dimensions WHERE day = ?1 ORDER BY provider_calls DESC LIMIT 500"
  ).bind(day).all<Record<string, unknown>>();
  return {
    day,
    actualSpendBrl: 0,
    paidProvidersLocked: true,
    policies: providerFreeQuota,
    usage: rows.results ?? [],
  };
}


export async function syncStaticControlPlane(
  db:D1DatabaseLike,
  now=new Date(),
):Promise<{apps:number;tasks:number;providers:number;models:number;routes:number;prompts:number}>{
  const timestamp=now.toISOString();

  for(const app of ecosystemApps){
    await db.prepare(
      "INSERT INTO cp_apps(app_id,display_name,default_locale,enabled,manifest_version,updated_at) VALUES (?1,?2,?3,?4,1,?5) " +
      "ON CONFLICT(app_id) DO UPDATE SET display_name=excluded.display_name,default_locale=excluded.default_locale,enabled=excluded.enabled,updated_at=excluded.updated_at"
    ).bind(app.appId,app.displayName,app.defaultLocale,app.enabled?1:0,timestamp).run();
  }

  for(const task of tasks){
    await db.prepare(
      "INSERT INTO cp_tasks(task_id,app_id,current_version,modality,sensitivity,streaming,status,updated_at) VALUES (?1,?2,?3,?4,?5,?6,'production',?7) " +
      "ON CONFLICT(task_id) DO UPDATE SET app_id=excluded.app_id,current_version=excluded.current_version,modality=excluded.modality,sensitivity=excluded.sensitivity,streaming=excluded.streaming,status='production',updated_at=excluded.updated_at"
    ).bind(task.id,task.app,task.version,task.modality,task.defaultSensitivity,task.streaming?1:0,timestamp).run();
    await db.prepare(
      "INSERT OR IGNORE INTO cp_task_versions(task_id,version,config_json,created_at) VALUES (?1,?2,?3,?4)"
    ).bind(task.id,task.version,JSON.stringify(task),timestamp).run();
  }

  for(const provider of Object.values(providers)){
    await db.prepare(
      "INSERT INTO cp_providers(provider_id,status,free_eligible,max_sensitivity,terms_reviewed_at,metadata_json,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7) " +
      "ON CONFLICT(provider_id) DO UPDATE SET status=excluded.status,free_eligible=excluded.free_eligible,max_sensitivity=excluded.max_sensitivity,terms_reviewed_at=excluded.terms_reviewed_at,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at"
    ).bind(provider.id,provider.status,provider.freeEligible?1:0,provider.maxSensitivity,provider.termsReviewedAt,JSON.stringify(provider),timestamp).run();
  }

  for(const [modelId,model] of Object.entries(models)){
    await db.prepare(
      "INSERT INTO cp_models(model_id,provider_id,provider_model_id,status,free_eligible,paid_required,metadata_json,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8) " +
      "ON CONFLICT(model_id) DO UPDATE SET provider_id=excluded.provider_id,provider_model_id=excluded.provider_model_id,status=excluded.status,free_eligible=excluded.free_eligible,paid_required=excluded.paid_required,metadata_json=excluded.metadata_json,updated_at=excluded.updated_at"
    ).bind(modelId,model.provider,model.providerModelId,model.status,model.freeEligible?1:0,model.paidRequired?1:0,JSON.stringify(model),timestamp).run();
  }

  const routes=controlPlaneRoutes();
  for(const route of routes){
    await db.prepare(
      "INSERT INTO cp_routes(route_id,task_id,current_version,status,updated_at) VALUES (?1,?2,?3,'production',?4) " +
      "ON CONFLICT(route_id) DO UPDATE SET task_id=excluded.task_id,current_version=excluded.current_version,status='production',updated_at=excluded.updated_at"
    ).bind(route.id,route.task,route.version,timestamp).run();
    await db.prepare(
      "INSERT OR IGNORE INTO cp_route_versions(route_id,version,config_json,created_at) VALUES (?1,?2,?3,?4)"
    ).bind(route.id,route.version,JSON.stringify(route),timestamp).run();
  }

  for(const prompt of Object.values(prompts)){
    await db.prepare(
      "INSERT INTO cp_prompts(prompt_id,task_id,current_version,status,updated_at) VALUES (?1,?2,?3,'production',?4) " +
      "ON CONFLICT(prompt_id) DO UPDATE SET task_id=excluded.task_id,current_version=excluded.current_version,status='production',updated_at=excluded.updated_at"
    ).bind(prompt.id,prompt.taskId,prompt.version,timestamp).run();
    await db.prepare(
      "INSERT OR IGNORE INTO cp_prompt_versions(prompt_id,version,content_json,created_at) VALUES (?1,?2,?3,?4)"
    ).bind(prompt.id,prompt.version,JSON.stringify(prompt),timestamp).run();
  }

  const policy=controlPlanePolicies();
  await db.prepare(
    "INSERT INTO cp_policies(policy_id,current_version,status,updated_at) VALUES ('core',1,'production',?1) " +
    "ON CONFLICT(policy_id) DO UPDATE SET current_version=1,status='production',updated_at=excluded.updated_at"
  ).bind(timestamp).run();
  await db.prepare(
    "INSERT OR IGNORE INTO cp_policy_versions(policy_id,version,config_json,created_at) VALUES ('core',1,?1,?2)"
  ).bind(JSON.stringify(policy),timestamp).run();

  for(const [providerId,quota] of Object.entries(providerFreeQuota)){
    await db.prepare(
      "INSERT INTO cp_quotas(quota_id,scope_type,scope_id,provider,config_json,updated_at) VALUES (?1,'provider',?2,?2,?3,?4) " +
      "ON CONFLICT(quota_id) DO UPDATE SET config_json=excluded.config_json,updated_at=excluded.updated_at"
    ).bind("provider:"+providerId,providerId,JSON.stringify(quota),timestamp).run();
  }

  return {
    apps:ecosystemApps.length,
    tasks:tasks.length,
    providers:Object.keys(providers).length,
    models:Object.keys(models).length,
    routes:routes.length,
    prompts:Object.keys(prompts).length,
  };
}
