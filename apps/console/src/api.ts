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
  };
};
export type CostData = {
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

async function adminFetch<T>(path:string):Promise<T> {
  const [token, appCheck] = await Promise.all([client.getAccessToken(), appCheckToken()]);
  const response = await fetch(path, {
    headers: {
      authorization: "Bearer " + token,
      "x-firebase-appcheck": appCheck,
      "x-millionsnest-app": APP_ID,
      "x-millionsnest-org": ORG_SCOPE,
      accept: "application/json",
    },
  });
  const body = await parseJson<T & {error?:string}>(response);
  if (!response.ok) throw new Error(body.error ?? "ADMIN_HTTP_" + response.status);
  return body;
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
