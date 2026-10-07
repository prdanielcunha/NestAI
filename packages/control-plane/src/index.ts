import { ecosystemApps } from "../../app-registry/src/index.js";
import { tasks } from "../../task-registry/src/index.js";
import { models } from "../../model-registry/src/index.js";
import { providers } from "../../provider-registry/src/index.js";
import { providerFreeQuota, quotaHealth } from "../../cost-guard/src/index.js";
import { getR2Usage, R2_FREE_TIER, R2_SAFETY } from "../../r2-storage/src/index.js";
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
  const [rows, r2] = await Promise.all([
    db.prepare(
      "SELECT scope_type, scope_id, provider, task, requests, provider_calls FROM daily_usage_dimensions WHERE day = ?1 ORDER BY provider_calls DESC LIMIT 500"
    ).bind(day).all<Record<string, unknown>>(),
    getR2Usage(db, now),
  ]);
  return {
    day,
    actualSpendBrl: 0,
    paidProvidersLocked: true,
    policies: providerFreeQuota,
    usage: rows.results ?? [],
    r2: {
      ...r2,
      freeTier: R2_FREE_TIER,
      safety: R2_SAFETY,
      remaining: {
        storageBytes: Math.max(0, R2_FREE_TIER.storageBytes - r2.storageBytes),
        classAOps: Math.max(0, R2_FREE_TIER.classAOps - r2.classAOps),
        classBOps: Math.max(0, R2_FREE_TIER.classBOps - r2.classBOps),
      },
    },
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


export async function recordEvaluationProbe(
  db: D1DatabaseLike,
  args: {
    targetId: string;
    provider: string;
    modelId: string;
    kind: string;
    latencyMs: number;
    passed: boolean;
    report: Record<string, unknown>;
  },
  now = new Date(),
): Promise<string> {
  const suiteId = "candidate:" + args.targetId;
  const runId = crypto.randomUUID();
  await db.prepare(
    `INSERT INTO cp_eval_suites(suite_id,task_id,name,status,updated_at)
     VALUES (?1,'__evaluation__',?2,'active',?3)
     ON CONFLICT(suite_id) DO UPDATE SET status='active',updated_at=excluded.updated_at`
  ).bind(suiteId, "Candidate benchmark — " + args.targetId, now.toISOString()).run();

  await db.prepare(
    `INSERT INTO cp_eval_runs(run_id,suite_id,target_json,score,passed,report_json,created_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7)`
  ).bind(
    runId,
    suiteId,
    JSON.stringify({
      targetId: args.targetId,
      provider: args.provider,
      modelId: args.modelId,
      kind: args.kind,
    }),
    args.passed ? 1 : 0,
    args.passed ? 1 : 0,
    JSON.stringify({
      latencyMs: args.latencyMs,
      ...args.report,
    }),
    now.toISOString(),
  ).run();
  return runId;
}


export type DynamicPromptDraft = {
  instructions: Partial<Record<"pt-BR" | "en" | "es", string>>;
};

export type DynamicRouteDraft = {
  providerOrder: string[];
};

export type DynamicPolicyDraft = {
  extraBlockedProviders: string[];
};

type VersionedResource = "prompt" | "route" | "policy";

async function actorHash(actorId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(actorId));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

async function appendControlPlaneAudit(
  db: D1DatabaseLike,
  args: { actorId: string; action: string; resourceType: string; resourceId: string; metadata?: Record<string, unknown> },
  now = new Date(),
): Promise<void> {
  await db.prepare(
    "INSERT INTO cp_audit_events(event_id,actor_hash,action,resource_type,resource_id,environment,metadata_json,created_at) VALUES (?1,?2,?3,?4,?5,'production',?6,?7)"
  ).bind(
    crypto.randomUUID(),
    await actorHash(args.actorId),
    args.action,
    args.resourceType,
    args.resourceId,
    JSON.stringify(args.metadata ?? {}),
    now.toISOString(),
  ).run();
}

function assertInstructionText(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.trim().length < 3 || value.length > 6000) {
    throw new Error("CONTROL_PLANE_PROMPT_INVALID");
  }
}

export function validatePromptDraft(promptId: string, draft: DynamicPromptDraft): DynamicPromptDraft {
  const base = prompts[promptId];
  if (!base) throw new Error("CONTROL_PLANE_PROMPT_NOT_FOUND");
  const allowed = new Set(["pt-BR", "en", "es"]);
  const entries = Object.entries(draft.instructions ?? {});
  if (entries.length === 0) throw new Error("CONTROL_PLANE_PROMPT_EMPTY");
  for (const [locale, value] of entries) {
    if (!allowed.has(locale)) throw new Error("CONTROL_PLANE_PROMPT_LOCALE_INVALID");
    assertInstructionText(value);
  }
  return { instructions: Object.fromEntries(entries.map(([locale, value]) => [locale, String(value).trim()])) };
}

export function validateRouteDraft(taskId: string, draft: DynamicRouteDraft): DynamicRouteDraft {
  const task = tasks.find((item) => item.id === taskId);
  if (!task) throw new Error("CONTROL_PLANE_ROUTE_NOT_FOUND");
  const providerOrder = [...new Set((draft.providerOrder ?? []).map(String))];
  if (providerOrder.length === 0) throw new Error("CONTROL_PLANE_ROUTE_EMPTY");
  for (const provider of providerOrder) {
    if (!task.allowedProviders.includes(provider) || task.blockedProviders.includes(provider)) {
      throw new Error("CONTROL_PLANE_ROUTE_PROVIDER_DENIED");
    }
  }
  return { providerOrder };
}

export function validatePolicyDraft(draft: DynamicPolicyDraft): DynamicPolicyDraft {
  const known = new Set(Object.keys(providers));
  const extraBlockedProviders = [...new Set((draft.extraBlockedProviders ?? []).map(String))];
  for (const provider of extraBlockedProviders) {
    if (!known.has(provider)) throw new Error("CONTROL_PLANE_POLICY_PROVIDER_INVALID");
  }
  return { extraBlockedProviders };
}

async function nextVersion(
  db: D1DatabaseLike,
  table: "cp_prompt_versions" | "cp_route_versions" | "cp_policy_versions",
  idColumn: "prompt_id" | "route_id" | "policy_id",
  id: string,
): Promise<number> {
  const row = await db.prepare(
    `SELECT COALESCE(MAX(version),0) AS version FROM ${table} WHERE ${idColumn}=?1`
  ).bind(id).first<{ version: number }>();
  return Number(row?.version ?? 0) + 1;
}

export async function createControlPlaneDraft(
  db: D1DatabaseLike,
  args:
    | { resource: "prompt"; id: string; config: DynamicPromptDraft; actorId: string }
    | { resource: "route"; id: string; config: DynamicRouteDraft; actorId: string }
    | { resource: "policy"; id: "core"; config: DynamicPolicyDraft; actorId: string },
  now = new Date(),
): Promise<{ resource: VersionedResource; id: string; version: number; config: unknown }> {
  if (args.resource === "prompt") {
    const config = validatePromptDraft(args.id, args.config);
    const version = await nextVersion(db, "cp_prompt_versions", "prompt_id", args.id);
    await db.prepare(
      "INSERT INTO cp_prompt_versions(prompt_id,version,content_json,created_at) VALUES (?1,?2,?3,?4)"
    ).bind(args.id, version, JSON.stringify(config), now.toISOString()).run();
    await appendControlPlaneAudit(db, { actorId: args.actorId, action: "draft.create", resourceType: "prompt", resourceId: args.id, metadata: { version } }, now);
    return { resource: args.resource, id: args.id, version, config };
  }
  if (args.resource === "route") {
    const config = validateRouteDraft(args.id, args.config);
    const version = await nextVersion(db, "cp_route_versions", "route_id", args.id + ":route");
    await db.prepare(
      "INSERT INTO cp_route_versions(route_id,version,config_json,created_at) VALUES (?1,?2,?3,?4)"
    ).bind(args.id + ":route", version, JSON.stringify(config), now.toISOString()).run();
    await appendControlPlaneAudit(db, { actorId: args.actorId, action: "draft.create", resourceType: "route", resourceId: args.id, metadata: { version } }, now);
    return { resource: args.resource, id: args.id, version, config };
  }
  if (args.id !== "core") throw new Error("CONTROL_PLANE_POLICY_NOT_FOUND");
  const config = validatePolicyDraft(args.config);
  const version = await nextVersion(db, "cp_policy_versions", "policy_id", "core");
  await db.prepare(
    "INSERT INTO cp_policy_versions(policy_id,version,config_json,created_at) VALUES ('core',?1,?2,?3)"
  ).bind(version, JSON.stringify(config), now.toISOString()).run();
  await appendControlPlaneAudit(db, { actorId: args.actorId, action: "draft.create", resourceType: "policy", resourceId: "core", metadata: { version } }, now);
  return { resource: args.resource, id: "core", version, config };
}

async function assertPromptEvalPassed(db: D1DatabaseLike, promptId: string, version: number): Promise<void> {
  const suiteId = "prompt:" + promptId + ":v" + version;
  const row = await db.prepare(
    "SELECT passed FROM cp_eval_runs WHERE suite_id=?1 ORDER BY created_at DESC LIMIT 1"
  ).bind(suiteId).first<{ passed: number }>();
  if (Number(row?.passed ?? 0) !== 1) throw new Error("CONTROL_PLANE_PROMPT_EVAL_REQUIRED");
}

export async function promoteControlPlaneDraft(
  db: D1DatabaseLike,
  args: { resource: VersionedResource; id: string; version: number; actorId: string },
  now = new Date(),
): Promise<{ resource: VersionedResource; id: string; version: number; status: "production" }> {
  if (!Number.isInteger(args.version) || args.version < 1) throw new Error("CONTROL_PLANE_VERSION_INVALID");
  if (args.resource === "prompt") {
    const row = await db.prepare("SELECT content_json FROM cp_prompt_versions WHERE prompt_id=?1 AND version=?2")
      .bind(args.id,args.version).first<{ content_json: string }>();
    if (!row) throw new Error("CONTROL_PLANE_DRAFT_NOT_FOUND");
    validatePromptDraft(args.id, JSON.parse(row.content_json) as DynamicPromptDraft);
    await assertPromptEvalPassed(db, args.id, args.version);
    await db.prepare(
      "UPDATE cp_prompts SET current_version=?1,status='production',updated_at=?2 WHERE prompt_id=?3"
    ).bind(args.version,now.toISOString(),args.id).run();
  } else if (args.resource === "route") {
    const routeId = args.id + ":route";
    const row = await db.prepare("SELECT config_json FROM cp_route_versions WHERE route_id=?1 AND version=?2")
      .bind(routeId,args.version).first<{ config_json: string }>();
    if (!row) throw new Error("CONTROL_PLANE_DRAFT_NOT_FOUND");
    validateRouteDraft(args.id, JSON.parse(row.config_json) as DynamicRouteDraft);
    await db.prepare(
      "UPDATE cp_routes SET current_version=?1,status='production',updated_at=?2 WHERE route_id=?3"
    ).bind(args.version,now.toISOString(),routeId).run();
  } else {
    if (args.id !== "core") throw new Error("CONTROL_PLANE_POLICY_NOT_FOUND");
    const row = await db.prepare("SELECT config_json FROM cp_policy_versions WHERE policy_id='core' AND version=?1")
      .bind(args.version).first<{ config_json: string }>();
    if (!row) throw new Error("CONTROL_PLANE_DRAFT_NOT_FOUND");
    validatePolicyDraft(JSON.parse(row.config_json) as DynamicPolicyDraft);
    await db.prepare(
      "UPDATE cp_policies SET current_version=?1,status='production',updated_at=?2 WHERE policy_id='core'"
    ).bind(args.version,now.toISOString()).run();
  }
  await appendControlPlaneAudit(db, { actorId: args.actorId, action: "draft.promote", resourceType: args.resource, resourceId: args.id, metadata: { version: args.version } }, now);
  return { resource: args.resource, id: args.id, version: args.version, status: "production" };
}

export async function recordPromptDraftEvaluation(
  db: D1DatabaseLike,
  args: { promptId: string; version: number; passed: boolean; latencyMs: number; actorId: string; report: Record<string, unknown> },
  now = new Date(),
): Promise<string> {
  const suiteId = "prompt:" + args.promptId + ":v" + args.version;
  const runId = crypto.randomUUID();
  await db.prepare(
    "INSERT INTO cp_eval_suites(suite_id,task_id,name,status,updated_at) VALUES (?1,?2,?3,'active',?4) ON CONFLICT(suite_id) DO UPDATE SET status='active',updated_at=excluded.updated_at"
  ).bind(suiteId,args.promptId,"Prompt draft evaluation — "+args.promptId+" v"+args.version,now.toISOString()).run();
  await db.prepare(
    "INSERT INTO cp_eval_runs(run_id,suite_id,target_json,score,passed,report_json,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(runId,suiteId,JSON.stringify({ promptId: args.promptId, version: args.version }),args.passed?1:0,args.passed?1:0,JSON.stringify({ latencyMs: args.latencyMs, ...args.report }),now.toISOString()).run();
  await appendControlPlaneAudit(db, { actorId: args.actorId, action: "draft.evaluate", resourceType: "prompt", resourceId: args.promptId, metadata: { version: args.version, passed: args.passed, runId } }, now);
  return runId;
}

export async function getActivePromptInstructions(
  db: D1DatabaseLike,
  promptId: string,
): Promise<DynamicPromptDraft["instructions"] | null> {
  const row = await db.prepare(
    "SELECT v.content_json AS content_json FROM cp_prompts p JOIN cp_prompt_versions v ON v.prompt_id=p.prompt_id AND v.version=p.current_version WHERE p.prompt_id=?1 AND p.status='production'"
  ).bind(promptId).first<{ content_json: string }>();
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.content_json) as Record<string, unknown>;
    if (!("instructions" in parsed)) return null;
    return validatePromptDraft(promptId, parsed as DynamicPromptDraft).instructions;
  } catch {
    return null;
  }
}

export async function applyActiveRoutePreference<T extends { provider: string }>(
  db: D1DatabaseLike,
  taskId: string,
  candidates: T[],
): Promise<T[]> {
  const row = await db.prepare(
    "SELECT v.config_json AS config_json FROM cp_routes r JOIN cp_route_versions v ON v.route_id=r.route_id AND v.version=r.current_version WHERE r.route_id=?1 AND r.status='production'"
  ).bind(taskId + ":route").first<{ config_json: string }>();
  if (!row) return candidates;
  try {
    const config = validateRouteDraft(taskId, JSON.parse(row.config_json) as DynamicRouteDraft);
    const rank = new Map(config.providerOrder.map((provider,index)=>[provider,index]));
    return [...candidates].sort((a,b)=>(rank.get(a.provider)??999)-(rank.get(b.provider)??999));
  } catch {
    return candidates;
  }
}

export async function applyActivePolicyOverlay<T extends { provider: string }>(
  db: D1DatabaseLike,
  candidates: T[],
): Promise<T[]> {
  const row = await db.prepare(
    "SELECT v.config_json AS config_json FROM cp_policies p JOIN cp_policy_versions v ON v.policy_id=p.policy_id AND v.version=p.current_version WHERE p.policy_id='core' AND p.status='production'"
  ).first<{ config_json: string }>();
  if (!row) return candidates;
  try {
    const config = validatePolicyDraft(JSON.parse(row.config_json) as DynamicPolicyDraft);
    const blocked = new Set(config.extraBlockedProviders);
    return candidates.filter((candidate)=>!blocked.has(candidate.provider));
  } catch {
    return candidates;
  }
}
