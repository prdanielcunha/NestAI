import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

export type TraceEvent = {
  traceId: string;
  task: string;
  appId: string;
  organizationIdHash: string;
  sensitivity: string;
  provider?: string | undefined;
  model?: string | undefined;
  promptVersion?: number | undefined;
  durationMs?: number | undefined;
  ttftMs?: number | undefined;
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  fallbackUsed?: boolean | undefined;
  retries?: number | undefined;
  cached?: boolean | undefined;
  outputValidation?: "not_required" | "passed" | "failed" | undefined;
  toolUsage?: boolean | undefined;
  outcome: "started" | "success" | "rejected" | "error";
  errorCode?: string | undefined;
};

export type ProviderHealthSample = {
  providerId: string;
  success: boolean;
  durationMs: number;
  errorCode?: string;
  circuitState?: string;
};

export type SloSnapshot = {
  totalRequests: number;
  errorRate: number;
  routerErrorRate: number;
  schemaFailureRate: number;
  p95Ms: number;
  fallbackRate: number;
  deadLetteredJobs: number;
  paidSpendBrl: number;
};

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1));
  return sorted[index] ?? 0;
}

export async function safeTrace(
  input: Omit<TraceEvent, "organizationIdHash"> & { organizationId: string },
): Promise<TraceEvent> {
  const { organizationId, ...rest } = input;
  return { ...rest, organizationIdHash: await digest(organizationId) };
}

export async function persistTrace(
  db: D1DatabaseLike,
  trace: TraceEvent,
  now = new Date(),
): Promise<void> {
  await db.prepare(
    "INSERT INTO request_traces(" +
    "trace_id,day,task,app_id,organization_hash,sensitivity,provider,model,prompt_version,duration_ms,ttft_ms," +
    "input_tokens,output_tokens,fallback_used,retries,cached,output_validation,tool_usage,outcome,error_code,created_at" +
    ") VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21) " +
    "ON CONFLICT(trace_id) DO UPDATE SET outcome=excluded.outcome,error_code=excluded.error_code,duration_ms=excluded.duration_ms,created_at=excluded.created_at"
  ).bind(
    trace.traceId,
    now.toISOString().slice(0,10),
    trace.task,
    trace.appId,
    trace.organizationIdHash,
    trace.sensitivity,
    trace.provider ?? null,
    trace.model ?? null,
    trace.promptVersion ?? null,
    trace.durationMs ?? null,
    trace.ttftMs ?? null,
    trace.inputTokens ?? null,
    trace.outputTokens ?? null,
    trace.fallbackUsed === undefined ? null : trace.fallbackUsed ? 1 : 0,
    trace.retries ?? null,
    trace.cached === undefined ? null : trace.cached ? 1 : 0,
    trace.outputValidation ?? null,
    trace.toolUsage === undefined ? null : trace.toolUsage ? 1 : 0,
    trace.outcome,
    trace.errorCode ?? null,
    now.toISOString(),
  ).run();
}

export async function recordProviderHealthSample(
  db: D1DatabaseLike,
  sample: ProviderHealthSample,
  now = new Date(),
): Promise<void> {
  await db.prepare(
    "INSERT INTO provider_runtime_samples(sample_id,provider_id,success,duration_ms,error_code,circuit_state,created_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(
    crypto.randomUUID(),
    sample.providerId,
    sample.success ? 1 : 0,
    Math.max(0,Math.floor(sample.durationMs)),
    sample.errorCode ?? null,
    sample.circuitState ?? null,
    now.toISOString(),
  ).run();

  const rows = await db.prepare(
    "SELECT success,duration_ms,circuit_state FROM provider_runtime_samples WHERE provider_id=?1 ORDER BY created_at DESC LIMIT 100"
  ).bind(sample.providerId).all<{success:number;duration_ms:number;circuit_state:string|null}>();
  const values = rows.results ?? [];
  const durations = values.map((row)=>Number(row.duration_ms));
  const successRate = values.length ? values.filter((row)=>Number(row.success)===1).length / values.length : 1;
  const state = successRate >= 0.98 ? "healthy" : successRate >= 0.90 ? "watch" : successRate >= 0.70 ? "degraded" : "critical";
  const circuitState = values.find((row)=>row.circuit_state)?.circuit_state ?? "UNKNOWN";

  await db.prepare(
    "INSERT INTO cp_provider_health(provider_id,state,success_rate,p50_ms,p95_ms,circuit_state,checked_at) " +
    "VALUES (?1,?2,?3,?4,?5,?6,?7) " +
    "ON CONFLICT(provider_id) DO UPDATE SET state=excluded.state,success_rate=excluded.success_rate,p50_ms=excluded.p50_ms,p95_ms=excluded.p95_ms,circuit_state=excluded.circuit_state,checked_at=excluded.checked_at"
  ).bind(
    sample.providerId,
    state,
    successRate,
    percentile(durations,0.5),
    percentile(durations,0.95),
    circuitState,
    now.toISOString(),
  ).run();
}

export async function buildSloSnapshot(
  db: D1DatabaseLike,
  now = new Date(),
): Promise<SloSnapshot> {
  const day = now.toISOString().slice(0,10);
  const rows = await db.prepare(
    "SELECT outcome,error_code,duration_ms,fallback_used,output_validation FROM request_traces WHERE day=?1"
  ).bind(day).all<{
    outcome:string;
    error_code:string|null;
    duration_ms:number|null;
    fallback_used:number|null;
    output_validation:string|null;
  }>();
  const traces = rows.results ?? [];
  const total = traces.length;
  const errors = traces.filter((row)=>row.outcome==="error" || row.outcome==="rejected").length;
  const routerErrors = traces.filter((row)=>row.error_code==="ROUTER_NO_ELIGIBLE_MODEL").length;
  const schemaFailures = traces.filter((row)=>row.output_validation==="failed" || String(row.error_code??"").startsWith("OUTPUT_SCHEMA_")).length;
  const fallbacks = traces.filter((row)=>Number(row.fallback_used)===1).length;
  const durations = traces.map((row)=>Number(row.duration_ms??0)).filter((value)=>value>0);

  const dead = await db.prepare(
    "SELECT COUNT(*) AS count FROM cp_jobs WHERE status='dead_lettered' AND substr(updated_at,1,10)=?1"
  ).bind(day).first<{count:number}>();

  return {
    totalRequests: total,
    errorRate: total ? errors/total : 0,
    routerErrorRate: total ? routerErrors/total : 0,
    schemaFailureRate: total ? schemaFailures/total : 0,
    p95Ms: percentile(durations,0.95),
    fallbackRate: total ? fallbacks/total : 0,
    deadLetteredJobs: Number(dead?.count??0),
    paidSpendBrl: 0,
  };
}

async function upsertAlert(
  db:D1DatabaseLike,
  args:{key:string;severity:"info"|"warning"|"critical";active:boolean;message:string;metadata:Record<string,unknown>},
  now=new Date(),
):Promise<void>{
  const existing=await db.prepare(
    "SELECT alert_id,status,first_seen_at FROM cp_alerts WHERE alert_key=?1"
  ).bind(args.key).first<{alert_id:string;status:string;first_seen_at:string}>();
  if(args.active){
    const id=existing?.alert_id??crypto.randomUUID();
    await db.prepare(
      "INSERT INTO cp_alerts(alert_id,alert_key,severity,status,message,metadata_json,first_seen_at,last_seen_at,resolved_at) " +
      "VALUES (?1,?2,?3,'open',?4,?5,?6,?7,NULL) " +
      "ON CONFLICT(alert_key) DO UPDATE SET severity=excluded.severity,status='open',message=excluded.message,metadata_json=excluded.metadata_json,last_seen_at=excluded.last_seen_at,resolved_at=NULL"
    ).bind(
      id,args.key,args.severity,args.message,JSON.stringify(args.metadata),
      existing?.first_seen_at??now.toISOString(),now.toISOString()
    ).run();
  } else if(existing?.status==="open"){
    await db.prepare(
      "UPDATE cp_alerts SET status='resolved',last_seen_at=?1,resolved_at=?1 WHERE alert_key=?2"
    ).bind(now.toISOString(),args.key).run();
  }
}

async function ensureIncident(
  db:D1DatabaseLike,
  args:{key:string;title:string;severity:"SEV1"|"SEV2"|"SEV3";active:boolean;metadata:Record<string,unknown>},
  now=new Date(),
):Promise<void>{
  const incidentId="auto:"+args.key;
  if(args.active){
    await db.prepare(
      "INSERT INTO cp_incidents(incident_id,severity,status,title,provider_id,opened_at,resolved_at,metadata_json) " +
      "VALUES (?1,?2,'open',?3,NULL,?4,NULL,?5) " +
      "ON CONFLICT(incident_id) DO UPDATE SET severity=excluded.severity,status='open',title=excluded.title,resolved_at=NULL,metadata_json=excluded.metadata_json"
    ).bind(incidentId,args.severity,args.title,now.toISOString(),JSON.stringify(args.metadata)).run();
  } else {
    await db.prepare(
      "UPDATE cp_incidents SET status='resolved',resolved_at=?1 WHERE incident_id=?2 AND status='open'"
    ).bind(now.toISOString(),incidentId).run();
  }
}

export async function evaluateSloAlerts(
  db:D1DatabaseLike,
  now=new Date(),
):Promise<{snapshot:SloSnapshot;alerts:string[]}>{
  const snapshot=await buildSloSnapshot(db,now);
  const rules=[
    {
      key:"router-error-rate",
      active:snapshot.totalRequests>=20 && snapshot.routerErrorRate>=0.001,
      severity:"critical" as const,
      message:"Router internal error rate exceeded 0.1%.",
      incident:"SEV2" as const,
    },
    {
      key:"schema-adherence",
      active:snapshot.totalRequests>=20 && snapshot.schemaFailureRate>0.005,
      severity:"critical" as const,
      message:"Structured output adherence fell below 99.5%.",
      incident:"SEV2" as const,
    },
    {
      key:"dead-letter-jobs",
      active:snapshot.deadLetteredJobs>0,
      severity:"warning" as const,
      message:"One or more jobs reached the dead-letter state.",
      incident:"SEV3" as const,
    },
    {
      key:"paid-spend",
      active:snapshot.paidSpendBrl>0,
      severity:"critical" as const,
      message:"Paid spend detected while FREE_ONLY is the required billing mode.",
      incident:"SEV1" as const,
    },
  ];

  const active:string[]=[];
  for(const rule of rules){
    await upsertAlert(db,{
      key:rule.key,
      severity:rule.severity,
      active:rule.active,
      message:rule.message,
      metadata:{snapshot},
    },now);
    await ensureIncident(db,{
      key:rule.key,
      title:rule.message,
      severity:rule.incident,
      active:rule.active,
      metadata:{snapshot},
    },now);
    if(rule.active) active.push(rule.key);
  }
  return {snapshot,alerts:active};
}
