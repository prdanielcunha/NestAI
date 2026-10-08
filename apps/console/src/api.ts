import { createNestAiClient } from "@millionsnest/ai";
import { appCheckToken, firebaseIdToken } from "./firebase";

const ORG_SCOPE = "global";
const APP_ID = "nestai";

const client = createNestAiClient({
  appId: APP_ID,
  organizationId: ORG_SCOPE,
  locale: "pt-BR",
  getFirebaseIdToken: firebaseIdToken,
  getAppCheckToken: appCheckToken,
});

export type Health = {
  ok: boolean;
  state: "operational" | "degraded";
  service: string;
  billingMode: string;
  appCheck: string;
  layers: Record<string,string>;
  providers: Record<string,string>;
};

export type OverviewData = {
  generatedAt?: string;
  requestsToday?: number;
  privacyRejected?: number;
  rateLimited?: number;
  appsEnabled?: number;
  tasksEnabled?: number;
  providerUsage?: Record<string, {
    calls?: number;
    hardLimit?: number;
    remaining?: number;
    quotaHealth?: string;
  }>;
  paidSpendBrl?: number;
  billingMode?: string;
};

export type AppRow = {
  appId: string;
  displayName: string;
  defaultLocale: string;
  enabled: boolean;
  taskCount: number;
  allowedTasks: string[];
};
export type AppsData = { apps: AppRow[] };

export type TaskRow = {
  id: string;
  version: number;
  app: string;
  modality: string;
  defaultSensitivity: string;
  streaming: boolean;
  structuredOutput: boolean;
  priority: string;
};
export type TasksData = { tasks: TaskRow[] };

export type RouteCandidate = {
  modelId: string;
  provider: string;
  providerModelId: string;
  reason: string[];
};
export type RouteRow = {
  id: string;
  task: string;
  version: number;
  currentVersion?: number;
  providerOrder?: string[];
  sensitivity: string;
  freeOnly: boolean;
  candidates: RouteCandidate[];
  primary: RouteCandidate | null;
  fallback: RouteCandidate | null;
};
export type RoutesData = { routes: RouteRow[] };

export type ProviderModel = { id: string; providerModelId?: string; status?: string; freeEligible?: boolean };
export type ProviderRow = {
  id: string;
  status: string;
  freeEligible: boolean;
  maxSensitivity: string;
  dataPolicy: string;
  termsReviewedAt: string;
  models: ProviderModel[];
};
export type ProvidersData = { providers: ProviderRow[] };

export type PromptRow = {
  id: string;
  taskId: string;
  version: number;
  locales: string[];
  hasStructuredOutput: boolean;
  systemPolicyPreview: string;
  currentVersion?: number;
  instructions?: Partial<Record<"pt-BR" | "en" | "es", string>>;
};
export type PromptsData = { prompts: PromptRow[] };

export type KnowledgeData = {
  sources?: Array<Record<string, unknown>>;
  indexes?: Array<Record<string, unknown>>;
};
export type EvaluationsData = {
  suites?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
};
export type ObservabilityData = {
  day?: string;
  totalEvents?: number;
  events?: Array<Record<string, unknown>>;
  traces?: Array<Record<string, unknown>>;
  providerHealth?: Array<Record<string, unknown>>;
  alerts?: Array<Record<string, unknown>>;
  incidents?: Array<Record<string, unknown>>;
  slo?: {
    totalRequests?: number;
    errorRate?: number;
    routerErrorRate?: number;
    schemaFailureRate?: number;
    p95Ms?: number;
    fallbackRate?: number;
    deadLetteredJobs?: number;
    paidSpendBrl?: number;
  };
};
export type PoliciesData = {
  policies?: {
    billingMode?: string;
    paidProvidersLocked?: boolean;
    dataClasses?: Record<string,{external?: string}>;
    providerMaxSensitivity?: Record<string,string>;
    currentVersion?: number;
    extraBlockedProviders?: string[];
  };
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
export type CostData = {
  freeCapacityAdvisory?: FreeCapacityAdvice[];
  day?: string;
  actualSpendBrl?: number;
  paidProvidersLocked?: boolean;
  policies?: Record<string, unknown>;
  usage?: Array<Record<string, unknown>>;
  r2?: {
    month?: string;
    storageBytes?: number;
    classAOps?: number;
    classBOps?: number;
    storageFraction?: number;
    classAFraction?: number;
    classBFraction?: number;
    highestFraction?: number;
    health?: string;
    freeTier?: { storageBytes?: number; classAOps?: number; classBOps?: number };
    safety?: { warnFraction?: number; conserveFraction?: number; blockFraction?: number; hardLockFraction?: number };
    remaining?: { storageBytes?: number; classAOps?: number; classBOps?: number };
  };
};
export type AuditData = { events: Array<Record<string, unknown>> };

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

export async function health(): Promise<Health> {
  const response = await fetch("/v1/health", { headers: { accept: "application/json" } });
  if (!response.ok) throw new Error("HEALTH_HTTP_" + response.status);
  return parseJson<Health>(response);
}

async function adminRequest<T>(path:string, init:RequestInit = {}):Promise<T> {
  const [token, appCheck] = await Promise.all([client.getAccessToken(), appCheckToken()]);
  const headers = new Headers(init.headers);
  headers.set("authorization", "Bearer " + token);
  headers.set("x-firebase-appcheck", appCheck);
  headers.set("x-millionsnest-app", APP_ID);
  headers.set("x-millionsnest-org", ORG_SCOPE);
  headers.set("accept", "application/json");
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...init, headers });
  const body = await parseJson<T & {error?:string}>(response);
  if (!response.ok) throw new Error(body.error ?? "ADMIN_HTTP_" + response.status);
  return body;
}

async function adminFetch<T>(path:string):Promise<T> {
  return adminRequest<T>(path);
}

export function overview(): Promise<OverviewData> { return adminFetch("/v1/admin/overview"); }
export function apps(): Promise<AppsData> { return adminFetch("/v1/admin/apps"); }
export function tasks(): Promise<TasksData> { return adminFetch("/v1/admin/tasks"); }
export function providers(): Promise<ProvidersData> { return adminFetch("/v1/admin/providers"); }
export function routes(): Promise<RoutesData> { return adminFetch("/v1/admin/routes"); }
export function prompts(): Promise<PromptsData> { return adminFetch("/v1/admin/prompts"); }
export function knowledge(): Promise<KnowledgeData> { return adminFetch("/v1/admin/knowledge"); }
export function evals(): Promise<EvaluationsData> { return adminFetch("/v1/admin/evals"); }
export function observability(): Promise<ObservabilityData> { return adminFetch("/v1/admin/observability"); }
export function cost(): Promise<CostData> { return adminFetch("/v1/admin/cost"); }
export function policies(): Promise<PoliciesData> { return adminFetch("/v1/admin/policies"); }
export function audit(): Promise<AuditData> { return adminFetch("/v1/admin/audit"); }

export { client };


export type EvalProbeInput = {
  targetId: "groq:qwen3.8-27b" | "cloudflare:bge-m3" | "cloudflare:bge-reranker-base" | "nvidia-nim:gpt-oss-20b-eval";
  sanitized: true;
  sensitivity: "P0_PUBLIC" | "P1_INTERNAL";
  prompt?: string;
  texts?: string[];
  query?: string;
  contexts?: string[];
};
export type EvalProbeResult = {
  requestId: string;
  runId: string;
  target: string;
  stage: string;
  latencyMs: number;
  result: unknown;
};
export function runEvalProbe(input: EvalProbeInput): Promise<EvalProbeResult> {
  return adminRequest("/v1/admin/evals/probe", { method: "POST", body: JSON.stringify(input) });
}

export type KnowledgeIngestInput = {
  sourceId: string;
  appId: string;
  organizationId: string;
  sensitivity: "P0_PUBLIC" | "P1_INTERNAL" | "P2_PERSONAL" | "P3_SENSITIVE" | "P4_RESTRICTED";
  locale: "pt-BR" | "en" | "es";
  title?: string;
  locatorPrefix?: string;
  text: string;
};
export type KnowledgeIngestResult = {
  requestId: string;
  sourceId: string;
  status: string;
  chunks: number;
  storage: { r2: string; quotaHealth: string | null };
};
export function ingestKnowledge(input: KnowledgeIngestInput): Promise<KnowledgeIngestResult> {
  return adminRequest("/v1/admin/knowledge/ingest", { method: "POST", body: JSON.stringify(input) });
}


export type ControlPlaneResource = "prompt" | "route" | "policy";
export type ControlPlaneDraftResult = {
  requestId: string;
  resource: ControlPlaneResource;
  id: string;
  version: number;
  config: unknown;
};
export function createConfigDraft(resource: ControlPlaneResource, id: string, config: unknown): Promise<ControlPlaneDraftResult> {
  return adminRequest("/v1/admin/config/drafts", {
    method: "POST",
    body: JSON.stringify({ resource, id, config }),
  });
}

export type PromptDraftEvalResult = {
  requestId: string;
  runId: string;
  promptId: string;
  version: number;
  latencyMs: number;
  result: unknown;
  meta: { providerClass: string; fallbackUsed: boolean; retries: number };
};
export function evaluatePromptDraft(input: {
  promptId: string;
  version: number;
  locale: "pt-BR" | "en" | "es";
  input: unknown;
}): Promise<PromptDraftEvalResult> {
  return adminRequest("/v1/admin/prompts/evaluate", {
    method: "POST",
    body: JSON.stringify({
      ...input,
      sanitized: true,
      sensitivity: "P0_PUBLIC",
    }),
  });
}

export function promoteConfigDraft(resource: ControlPlaneResource, id: string, version: number): Promise<{
  requestId: string;
  resource: ControlPlaneResource;
  id: string;
  version: number;
  status: "production";
}> {
  return adminRequest("/v1/admin/config/promote", {
    method: "POST",
    body: JSON.stringify({ resource, id, version }),
  });
}
