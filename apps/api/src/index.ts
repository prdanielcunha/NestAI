import { TaskRequest, AudioInput, VisionInput, EmbeddingInput, ImageInput, RagQueryRequest, KnowledgeIngestRequest } from "../../../packages/contracts/src/index.js";
import { verifyNestAiToken, requireCapability, readNestAiTokenHeader, type NestAiClaims } from "../../../packages/auth/src/index.js";
import { verifyFirebaseAppCheckToken } from "../../../packages/app-check/src/index.js";
import { classifyPrivacy } from "../../../packages/privacy-firewall/src/index.js";
import { getTask, type TaskDefinition } from "../../../packages/task-registry/src/index.js";
import { routeCandidates, type RouteDecision } from "../../../packages/router/src/index.js";
import {
  generateWithCloudflare,
  generateWithGemini,
  generateWithGroq,
  generateWithMistral,
  streamWithCloudflare,
  streamWithGemini,
  streamWithGroq,
  streamWithMistral,
  transcribeWithCloudflare,
  transcribeWithGroq,
  extractDocumentTextWithCloudflare,
  extractDocumentsTextWithCloudflare,
  embedWithCloudflare,
  generateImageWithCloudflare,
  probeGroq,
  probeGemini,
  probeMistral,
  type ProviderProbeResult,
  type GenerateRequest,
  type GenerateResult,
  type WorkersAiBinding,
} from "../../../packages/providers/src/index.js";
import { assertProviderFreeQuota, assertWithinFreeBudget } from "../../../packages/cost-guard/src/index.js";
import { safeTrace, persistTrace, recordProviderHealthSample, evaluateSloAlerts } from "../../../packages/observability/src/index.js";
import { incrementUsage, getDimensionalUsage, incrementDimensionalUsage, recordRuntimeEvent, type D1DatabaseLike } from "../../../packages/usage-ledger/src/index.js";
import { buildTaskPrompt } from "../../../packages/prompt-registry/src/index.js";
import { getStructuredContract, validateStructuredText, assertGroundedEvidenceInput, verifyGroundedEvidence } from "../../../packages/structured-output/src/index.js";
import { CircuitBreaker, executeWithSafeFallback } from "../../../packages/resilience/src/index.js";
import type { Locale } from "../../../packages/i18n/src/index.js";
import { cacheGet, cachePut, type KvNamespaceLike } from "../../../packages/cache/src/index.js";
import { createJob, enqueueJob, getJobForScope, getJobResult, nextAttempt, putJobResult, retryDelaySeconds, updateJobStatus, type JobEnvelope, type QueueLike } from "../../../packages/jobs/src/index.js";
import { buildMissionControlOverview, controlPlaneApps, controlPlaneTasks, controlPlaneProviders, controlPlanePolicies, controlPlaneAudit, controlPlaneRoutes, controlPlanePrompts, controlPlaneKnowledge, controlPlaneEvaluations, controlPlaneObservability, controlPlaneCostQuota, syncStaticControlPlane } from "../../../packages/control-plane/src/index.js";
import { validateAppManifest, assertManifestTaskOwnership, persistAppManifest } from "../../../packages/app-manifest/src/index.js";
import { verifyGitHubWorkloadToken } from "../../../packages/workload-auth/src/index.js";
import { queryKnowledge, upsertKnowledge, persistKnowledgeSource, ragOrganizationHash, ragScopedSourceId, type VectorizeLike } from "../../../packages/rag/src/index.js";
import { getR2Usage, putR2Object, r2Utf8Size, reconcileR2Inventory, type R2BucketLike } from "../../../packages/r2-storage/src/index.js";

type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

export type Env = {
  AI: WorkersAiBinding;
  AI_RATE_LIMITER: RateLimiter;
  DB: D1DatabaseLike;
  CACHE?: KvNamespaceLike;
  JOBS?: QueueLike<JobEnvelope>;
  JOBS_DLQ?: QueueLike<{ job: JobEnvelope; error: string }>;
  VECTORIZE?: VectorizeLike;
  KNOWLEDGE_BUCKET?: R2BucketLike;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  MISTRAL_API_KEY?: string;
  HUB_JWKS_URL: string;
  HUB_TOKEN_ISSUER: string;
  NESTAI_TOKEN_AUDIENCE: string;
  FIREBASE_PROJECT_NUMBER: string;
  APP_CHECK_REQUIRED: "true" | "false";
  AI_BILLING_MODE: "FREE_ONLY";
  ALLOW_PAID_FALLBACK: "false";
  AUTO_UPGRADE_PROVIDER: "false";
  AI_ALL_ENABLED: "true" | "false";
  AI_EXTERNAL_PROVIDERS_ENABLED: "true" | "false";
  AI_PAID_ENABLED: "false";
  AI_TOOLS_WRITE_ENABLED: "true" | "false";
  AI_CONNECT_ENABLED?: "true" | "false";
  AI_FINANCE_ENABLED?: "true" | "false";
  AI_NESTLUME_ENABLED?: "true" | "false";
  AI_NESTAFFILIATE_ENABLED?: "true" | "false";
  AI_NESTLOCAL_ENABLED?: "true" | "false";
  AI_NESTJOURNEY_ENABLED?: "true" | "false";
  AI_MUSICSCALE_ENABLED?: "true" | "false";
  AI_HUB_ENABLED?: "true" | "false";
  AI_JOBS_ENABLED?: "true" | "false";
  AI_CACHE_ENABLED?: "true" | "false";
  AI_VECTORIZE_ENABLED?: "true" | "false";
  AI_R2_WRITES_ENABLED?: "true" | "false";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "INTERNAL_ERROR";
}

function statusFor(code: string): number {
  if (code.startsWith("AUTH_") || code.startsWith("APP_CHECK_")) return 401;
  if (code === "TASK_NOT_REGISTERED") return 404;
  if (code.startsWith("COST_GUARD_") || code.startsWith("R2_") || code === "RATE_LIMITED") return 429;
  if (code.startsWith("PRIVACY_") || code.startsWith("OUTPUT_SCHEMA_") || code.startsWith("EVIDENCE_") || code === "ROUTER_NO_ELIGIBLE_MODEL") return 422;
  if (code === "AI_DISABLED" || code === "APP_AI_DISABLED") return 503;
  if (code === "PROVIDER_TIMEOUT") return 504;
  return 500;
}

type JwksKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let jwksCache: { expiresAt: number; keys: JwksKey[] } | null = null;

export function resetHubJwksCacheForTests(): void {
  jwksCache = null;
}
const breaker = new CircuitBreaker({ failureThreshold: 3, openMs: 30_000 });

async function resolveHubPublicJwk(token: string, env: Env): Promise<JsonWebKey> {
  const header = readNestAiTokenHeader(token);
  const now = Date.now();
  if (!jwksCache || jwksCache.expiresAt <= now) {
    const response = await fetch(env.HUB_JWKS_URL, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("AUTH_JWKS_UNAVAILABLE");
    const body = await response.json() as { keys?: JwksKey[] };
    if (!Array.isArray(body.keys) || body.keys.length === 0) throw new Error("AUTH_JWKS_EMPTY");
    jwksCache = { keys: body.keys, expiresAt: now + 300_000 };
  }
  const key = header.kid
    ? jwksCache.keys.find((candidate) => candidate.kid === header.kid)
    : jwksCache.keys.length === 1 ? jwksCache.keys[0] : undefined;
  if (!key) throw new Error("AUTH_KEY_NOT_FOUND");
  if (key.kty !== "EC" || key.crv !== "P-256") throw new Error("AUTH_KEY_UNSUPPORTED");
  return key;
}

function appFlag(task: TaskDefinition, env: Env): "true" | "false" | undefined {
  const flags: Record<string, "true" | "false" | undefined> = {
    connect: env.AI_CONNECT_ENABLED,
    nestfinance: env.AI_FINANCE_ENABLED,
    nestlume: env.AI_NESTLUME_ENABLED,
    nestaffiliate: env.AI_NESTAFFILIATE_ENABLED,
    nestlocal: env.AI_NESTLOCAL_ENABLED,
    nestjourney: env.AI_NESTJOURNEY_ENABLED,
    musicscale: env.AI_MUSICSCALE_ENABLED,
    millionsnest: env.AI_HUB_ENABLED,
  };
  return flags[task.app];
}

function assertKillSwitches(task: TaskDefinition, env: Env): void {
  if (env.AI_ALL_ENABLED !== "true") throw new Error("AI_DISABLED");
  if (appFlag(task, env) === "false") throw new Error("APP_AI_DISABLED");
}

function availableProviders(env: Env): string[] {
  const result = ["cloudflare"];
  if (env.AI_EXTERNAL_PROVIDERS_ENABLED === "true") {
    if (env.GROQ_API_KEY) result.push("groq");
    if (env.GEMINI_API_KEY) result.push("gemini");
    if (env.MISTRAL_API_KEY) result.push("mistral");
  }
  return result;
}

async function providerSecretFingerprint(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function cachedProviderProbe(
  env: Env,
  provider: "groq" | "gemini" | "mistral",
): Promise<ProviderProbeResult> {
  const secret =
    provider === "groq" ? env.GROQ_API_KEY :
    provider === "gemini" ? env.GEMINI_API_KEY :
    env.MISTRAL_API_KEY;

  if (!secret) return { provider, state: "unconfigured" };
  const fingerprint = await providerSecretFingerprint(secret);
  const cacheKey = "provider-probe:v2:" + provider + ":" + fingerprint;

  if (env.CACHE) {
    const cached = await env.CACHE.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached) as ProviderProbeResult;
      } catch {
        await env.CACHE.delete(cacheKey);
      }
    }
  }

  const result =
    provider === "groq" ? await probeGroq(secret) :
    provider === "gemini" ? await probeGemini(secret) :
    await probeMistral(secret);

  if (env.CACHE) {
    await env.CACHE.put(cacheKey, JSON.stringify(result), {
      expirationTtl: result.state === "ready" ? 21_600 : 3_600,
    });
  }
  return result;
}

async function authenticateAdminRequest(request: Request, env: Env): Promise<NestAiClaims> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_MISSING_BEARER");

  const organizationId = request.headers.get("x-millionsnest-org");
  if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");

  const appHeader = request.headers.get("x-millionsnest-app");
  if (appHeader !== "nestai") throw new Error("AUTH_APP_HEADER_MISMATCH");

  const token = authorization.slice(7);
  const publicJwk = await resolveHubPublicJwk(token, env);
  const claims = await verifyNestAiToken(token, {
    issuer: env.HUB_TOKEN_ISSUER,
    audience: env.NESTAI_TOKEN_AUDIENCE,
    publicJwk,
    expectedOrganizationId: organizationId,
    expectedAppId: "nestai",
  });
  requireCapability(claims, "ai:admin");

  if (claims.tokenType !== "service" && env.APP_CHECK_REQUIRED === "true") {
    const appCheckToken = request.headers.get("x-firebase-appcheck");
    if (!appCheckToken) throw new Error("APP_CHECK_REQUIRED");
    if (!claims.appCheckAppId) throw new Error("APP_CHECK_BINDING_MISSING");
    await verifyFirebaseAppCheckToken(appCheckToken, {
      projectNumber: env.FIREBASE_PROJECT_NUMBER,
      expectedAppId: claims.appCheckAppId,
    });
  }
  return claims;
}

async function authenticateScopedRequest(request: Request, env: Env): Promise<NestAiClaims> {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_MISSING_BEARER");

  const organizationId = request.headers.get("x-millionsnest-org");
  if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");
  const appId = request.headers.get("x-millionsnest-app");
  if (!appId) throw new Error("AUTH_APP_HEADER_MISMATCH");

  const token = authorization.slice(7);
  const publicJwk = await resolveHubPublicJwk(token, env);
  const claims = await verifyNestAiToken(token, {
    issuer: env.HUB_TOKEN_ISSUER,
    audience: env.NESTAI_TOKEN_AUDIENCE,
    publicJwk,
    expectedOrganizationId: organizationId,
    expectedAppId: appId,
  });
  requireCapability(claims, "ai:run");

  if (claims.tokenType !== "service" && env.APP_CHECK_REQUIRED === "true") {
    const appCheckToken = request.headers.get("x-firebase-appcheck");
    if (!appCheckToken) throw new Error("APP_CHECK_REQUIRED");
    if (!claims.appCheckAppId) throw new Error("APP_CHECK_BINDING_MISSING");
    await verifyFirebaseAppCheckToken(appCheckToken, {
      projectNumber: env.FIREBASE_PROJECT_NUMBER,
      expectedAppId: claims.appCheckAppId,
    });
  }
  return claims;
}

async function authenticateRequest(args: {
  request: Request;
  env: Env;
  task: TaskDefinition;
  organizationId: string;
}): Promise<NestAiClaims> {
  const authorization = args.request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_MISSING_BEARER");

  const appHeader = args.request.headers.get("x-millionsnest-app");
  if (!appHeader || appHeader !== args.task.app) throw new Error("AUTH_APP_HEADER_MISMATCH");

  const token = authorization.slice(7);
  const publicJwk = await resolveHubPublicJwk(token, args.env);
  const claims = await verifyNestAiToken(token, {
    issuer: args.env.HUB_TOKEN_ISSUER,
    audience: args.env.NESTAI_TOKEN_AUDIENCE,
    publicJwk,
    expectedOrganizationId: args.organizationId,
    expectedAppId: args.task.app,
  });
  requireCapability(claims, args.task.capability);

  if (claims.tokenType === "guest") {
    if (claims.organizationId !== "public:" + args.task.app) throw new Error("AUTH_GUEST_TENANT_DENIED");
    if (!["P0_PUBLIC", "P1_INTERNAL"].includes(args.task.defaultSensitivity)) {
      throw new Error("AUTH_GUEST_SENSITIVITY_DENIED");
    }
  }

  if (claims.tokenType !== "service" && args.env.APP_CHECK_REQUIRED === "true") {
    const appCheckToken = args.request.headers.get("x-firebase-appcheck");
    if (!appCheckToken) throw new Error("APP_CHECK_REQUIRED");
    if (!claims.appCheckAppId) throw new Error("APP_CHECK_BINDING_MISSING");
    await verifyFirebaseAppCheckToken(appCheckToken, {
      projectNumber: args.env.FIREBASE_PROJECT_NUMBER,
      expectedAppId: claims.appCheckAppId,
    });
  }

  return claims;
}

async function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await Promise.race([
      work(controller.signal),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function generateForRoute(env: Env, request: GenerateRequest): Promise<GenerateResult> {
  const started = Date.now();
  try {
    let result: GenerateResult;
    if (request.route.provider === "cloudflare") result = await generateWithCloudflare(env.AI, request);
    else if (request.route.provider === "groq") result = await generateWithGroq(env.GROQ_API_KEY ?? "", request);
    else if (request.route.provider === "gemini") result = await generateWithGemini(env.GEMINI_API_KEY ?? "", request);
    else if (request.route.provider === "mistral") result = await generateWithMistral(env.MISTRAL_API_KEY ?? "", request);
    else throw new Error("PROVIDER_NOT_IMPLEMENTED");

    await recordProviderHealthSample(env.DB, {
      providerId: request.route.provider,
      success: true,
      durationMs: Date.now() - started,
      circuitState: breaker.snapshot(request.route.provider + ":" + request.route.providerModelId).state,
    });
    return result;
  } catch (error) {
    await recordProviderHealthSample(env.DB, {
      providerId: request.route.provider,
      success: false,
      durationMs: Date.now() - started,
      errorCode: errorCode(error),
      circuitState: breaker.snapshot(request.route.provider + ":" + request.route.providerModelId).state,
    });
    throw error;
  }
}

async function streamForRoute(env: Env, request: GenerateRequest): Promise<AsyncIterable<string>> {
  if (request.route.provider === "cloudflare") return streamWithCloudflare(env.AI, request);
  if (request.route.provider === "groq") return streamWithGroq(env.GROQ_API_KEY ?? "", request);
  if (request.route.provider === "gemini") return streamWithGemini(env.GEMINI_API_KEY ?? "", request);
  if (request.route.provider === "mistral") return streamWithMistral(env.MISTRAL_API_KEY ?? "", request);
  throw new Error("PROVIDER_NOT_IMPLEMENTED");
}

async function emitTrace(env: Env, trace: Awaited<ReturnType<typeof safeTrace>>): Promise<void> {
  await persistTrace(env.DB, trace);
  console.log(JSON.stringify(trace));
}

function sse(event: string, data: unknown): Uint8Array {
  return new TextEncoder().encode("event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n");
}

async function nextWithDeadline<T>(
  iterator: AsyncIterator<T>,
  deadlineMs: number,
  signal: AbortSignal,
): Promise<IteratorResult<T>> {
  if (signal.aborted) throw new Error("CLIENT_ABORTED");
  const remaining = deadlineMs - Date.now();
  if (remaining <= 0) throw new Error("PROVIDER_TIMEOUT");
  return Promise.race([
    iterator.next(),
    new Promise<IteratorResult<T>>((_, reject) => {
      const timer = setTimeout(() => reject(new Error("PROVIDER_TIMEOUT")), remaining);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new Error("CLIENT_ABORTED"));
      }, { once: true });
    }),
  ]);
}

async function quotaEligibleCandidates(
  env: Env,
  claims: NestAiClaims,
  task: TaskDefinition,
  organizationId: string,
  candidates: RouteDecision[],
): Promise<RouteDecision[]> {
  const eligible: RouteDecision[] = [];

  for (const candidate of candidates) {
    try {
      const [providerUsage, appUsage, organizationUsage, userUsage] = await Promise.all([
        getDimensionalUsage(env.DB, {
          scopeType: "provider",
          scopeId: candidate.provider,
          provider: candidate.provider,
        }),
        getDimensionalUsage(env.DB, {
          scopeType: "app",
          scopeId: task.app,
          provider: candidate.provider,
        }),
        getDimensionalUsage(env.DB, {
          scopeType: "organization",
          scopeId: organizationId,
          provider: candidate.provider,
        }),
        getDimensionalUsage(env.DB, {
          scopeType: "user",
          scopeId: claims.sub,
          provider: candidate.provider,
        }),
      ]);

      assertProviderFreeQuota(candidate.provider, providerUsage.provider_calls, task.priority);
      assertWithinFreeBudget(
        { requestsToday: appUsage.requests, providerCallsToday: appUsage.provider_calls },
        { maxRequestsPerDay: 700, maxProviderCallsPerDay: 700 },
      );
      assertWithinFreeBudget(
        { requestsToday: organizationUsage.requests, providerCallsToday: organizationUsage.provider_calls },
        { maxRequestsPerDay: 300, maxProviderCallsPerDay: 300 },
      );
      assertWithinFreeBudget(
        { requestsToday: userUsage.requests, providerCallsToday: userUsage.provider_calls },
        { maxRequestsPerDay: 100, maxProviderCallsPerDay: 100 },
      );

      eligible.push(candidate);
    } catch {
      continue;
    }
  }

  if (eligible.length === 0) throw new Error("COST_GUARD_PROVIDER_LIMIT");
  return eligible;
}

async function recordProviderAttempt(
  env: Env,
  claims: NestAiClaims,
  task: TaskDefinition,
  organizationId: string,
  provider: string,
): Promise<void> {
  await Promise.all([
    incrementUsage(env.DB, organizationId, provider),
    incrementDimensionalUsage(env.DB, [
      { scopeType: "provider", scopeId: provider, provider },
      { scopeType: "provider", scopeId: provider, provider, task: task.id },
      { scopeType: "app", scopeId: task.app, provider },
      { scopeType: "organization", scopeId: organizationId, provider },
      { scopeType: "user", scopeId: claims.sub, provider },
      { scopeType: "app", scopeId: task.app, provider, task: task.id },
      { scopeType: "organization", scopeId: organizationId, provider, task: task.id },
    ]),
  ]);
}

function assertGuestSensitivity(claims: NestAiClaims, sensitivity: ReturnType<typeof classifyPrivacy>["sensitivity"]): void {
  if (claims.tokenType === "guest" && sensitivity !== "P0_PUBLIC" && sensitivity !== "P1_INTERNAL") {
    throw new Error("AUTH_GUEST_SENSITIVITY_DENIED");
  }
}

type PreparedTaskExecution = {
  parsed: ReturnType<typeof TaskRequest.parse>;
  task: TaskDefinition;
  organizationId: string;
  claims: NestAiClaims;
  sensitivity: ReturnType<typeof classifyPrivacy>["sensitivity"];
  locale: Locale;
};

async function prepareTaskExecution(
  request: Request,
  env: Env,
  expectedModality: TaskDefinition["modality"],
): Promise<PreparedTaskExecution> {
  const raw = await request.json();
  const parsed = TaskRequest.parse(raw);
  const task = getTask(parsed.task);
  if (task.modality !== expectedModality) throw new Error("TASK_MODALITY_MISMATCH");
  assertKillSwitches(task, env);

  const organizationId = parsed.context.organizationId;
  if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");
  const claims = await authenticateRequest({ request, env, task, organizationId });

  const rate = await env.AI_RATE_LIMITER.limit({ key: claims.organizationId + ":" + claims.sub });
  if (!rate.success) {
    await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "rate_limited", appId: task.app, task: task.id });
    throw new Error("RATE_LIMITED");
  }

  const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
  assertGuestSensitivity(claims, privacy.sensitivity);
  if (!privacy.externalAllowed) {
    await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "privacy_rejected", appId: task.app, task: task.id });
    throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");
  }

  return {
    parsed,
    task,
    organizationId,
    claims,
    sensitivity: privacy.sensitivity,
    locale: (parsed.context.locale ?? claims.locale ?? "pt-BR") as Locale,
  };
}

async function safeCandidates(
  env: Env,
  prepared: PreparedTaskExecution,
  modality: TaskDefinition["modality"],
  needsStructuredOutput = false,
): Promise<RouteDecision[]> {
  const candidates = routeCandidates({
    sensitivity: prepared.sensitivity,
    billingMode: env.AI_BILLING_MODE,
    modality,
    allowedProviders: prepared.task.allowedProviders,
    blockedProviders: prepared.task.blockedProviders,
    availableProviders: availableProviders(env),
    needsStructuredOutput,
  });
  if (candidates.length === 0) throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
  return quotaEligibleCandidates(env, prepared.claims, prepared.task, prepared.organizationId, candidates);
}


function serviceClaimsForJob(job: JobEnvelope): NestAiClaims {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "nestai:queue",
    aud: "nestai",
    sub: "job:" + job.id,
    organizationId: job.organizationId,
    appId: job.appId,
    capabilities: ["ai:run"],
    scopes: ["ai:run"],
    locale: job.locale,
    tokenType: "service",
    iat: now,
    exp: now + 900,
  };
}

async function executeJobEnvelope(env: Env, job: JobEnvelope): Promise<unknown> {
  const task = getTask(job.task);
  if (task.app !== job.appId) throw new Error("JOB_APP_TASK_MISMATCH");
  assertKillSwitches(task, env);

  const privacy = classifyPrivacy(job.payload, task.defaultSensitivity);
  if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

  const claims = serviceClaimsForJob(job);
  const parsed = TaskRequest.parse({
    task: task.id,
    input: job.payload,
    context: { organizationId: job.organizationId, locale: job.locale },
  });
  const prepared: PreparedTaskExecution = {
    parsed,
    task,
    organizationId: job.organizationId,
    claims,
    sensitivity: privacy.sensitivity,
    locale: job.locale,
  };

  if (task.modality === "text") {
    assertGroundedEvidenceInput(task.id, job.payload);
    const structured = getStructuredContract(task.id);
    const candidates = await safeCandidates(env, prepared, "text", structured !== null);
    const prompt = buildTaskPrompt({ taskId: task.id, locale: job.locale, input: job.payload });
    const execution = await executeWithSafeFallback({
      candidates,
      keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate }) => {
        await recordProviderAttempt(env, claims, task, job.organizationId, candidate.provider);
        return withTimeout(
          (signal) => generateForRoute(env, {
            route: candidate,
            messages: prompt.messages,
            maxTokens: task.maxOutputTokens,
            ...(structured ? { responseSchema: structured.jsonSchema } : {}),
            signal,
          }),
          task.timeoutMs,
        );
      },
    });
    const result = validateStructuredText(task.id, execution.result.text);
    verifyGroundedEvidence(task.id, job.payload, result);
    return result;
  }

  if (task.modality === "audio") {
    const input = AudioInput.parse(job.payload);
    const candidates = await safeCandidates(env, prepared, "audio");
    const execution = await executeWithSafeFallback({
      candidates,
      keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate }) => {
        await recordProviderAttempt(env, claims, task, job.organizationId, candidate.provider);
        if (candidate.provider === "cloudflare") {
          return withTimeout(
            () => transcribeWithCloudflare(env.AI, candidate.providerModelId, input.audioBase64, input.language),
            task.timeoutMs,
          );
        }
        if (candidate.provider === "groq") {
          return withTimeout(
            (signal) => transcribeWithGroq(env.GROQ_API_KEY ?? "", candidate.providerModelId, {
              audioBase64: input.audioBase64,
              mimeType: input.mimeType,
              ...(input.fileName ? { fileName: input.fileName } : {}),
              ...(input.language ? { language: input.language } : {}),
              signal,
            }),
            task.timeoutMs,
          );
        }
        throw new Error("PROVIDER_MODALITY_UNSUPPORTED");
      },
    });
    return execution.result;
  }

  if (task.modality === "vision") {
    const input = VisionInput.parse(job.payload);
    await recordProviderAttempt(env, claims, task, job.organizationId, "cloudflare");
    const convertedInput = "files" in input
      ? await withTimeout(
          () => extractDocumentsTextWithCloudflare(env.AI, {
            files: input.files.map((file) => ({
              base64: file.fileBase64,
              mimeType: file.mimeType,
              fileName: file.fileName,
              ...(file.label ? { label: file.label } : {}),
            })),
            locale: job.locale,
          }),
          Math.min(task.timeoutMs, 25_000),
        )
      : [await withTimeout(
          () => extractDocumentTextWithCloudflare(env.AI, {
            base64: input.fileBase64,
            mimeType: input.mimeType,
            fileName: input.fileName,
            locale: job.locale,
          }),
          Math.min(task.timeoutMs, 25_000),
        ).then((item) => ({
          fileName: input.fileName,
          ...("label" in input && input.label ? { label: input.label } : {}),
          text: item.text,
          ...(item.tokens !== undefined ? { tokens: item.tokens } : {}),
        }))];
    const structured = getStructuredContract(task.id);
    const candidates = await safeCandidates(env, prepared, "text", structured !== null);
    const prompt = buildTaskPrompt({
      taskId: task.id,
      locale: job.locale,
      input: {
        files: convertedInput.map(({ fileName, label, text }) => ({
          fileName,
          ...(label ? { label } : {}),
          extractedText: text,
        })),
        context: input.context ?? {},
      },
    });
    const execution = await executeWithSafeFallback({
      candidates,
      keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate }) => {
        await recordProviderAttempt(env, claims, task, job.organizationId, candidate.provider);
        return withTimeout(
          (signal) => generateForRoute(env, {
            route: candidate,
            messages: prompt.messages,
            maxTokens: task.maxOutputTokens,
            ...(structured ? { responseSchema: structured.jsonSchema } : {}),
            signal,
          }),
          task.timeoutMs,
        );
      },
    });
    return validateStructuredText(task.id, execution.result.text);
  }

  if (task.modality === "embedding") {
    const input = EmbeddingInput.parse(job.payload);
    const [candidate] = await safeCandidates(env, prepared, "embedding");
    if (!candidate || candidate.provider !== "cloudflare") throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
    await recordProviderAttempt(env, claims, task, job.organizationId, candidate.provider);
    const vectors = await withTimeout(
      () => embedWithCloudflare(env.AI, candidate.providerModelId, input.texts),
      task.timeoutMs,
    );
    return { vectors, dimensions: vectors[0]?.length ?? 0 };
  }

  if (task.modality === "image") {
    const input = ImageInput.parse(job.payload);
    const [candidate] = await safeCandidates(env, prepared, "image");
    if (!candidate || candidate.provider !== "cloudflare") throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
    const imageUsage = await getDimensionalUsage(env.DB, {
      scopeType: "provider",
      scopeId: candidate.provider,
      provider: candidate.provider,
      task: task.id,
    });
    if (imageUsage.provider_calls >= 20) throw new Error("COST_GUARD_IMAGE_DAILY_LIMIT");
    await recordProviderAttempt(env, claims, task, job.organizationId, candidate.provider);
    return withTimeout(
      () => generateImageWithCloudflare(env.AI, candidate.providerModelId, {
        prompt: input.prompt,
        ...(input.steps !== undefined ? { steps: input.steps } : {}),
        ...(input.seed !== undefined ? { seed: input.seed } : {}),
      }),
      task.timeoutMs,
    );
  }

  throw new Error("JOB_MODALITY_UNSUPPORTED");
}

type QueueMessageLike<T> = {
  body: T;
  ack(): void;
};

type QueueBatchLike<T> = {
  messages: Array<QueueMessageLike<T>>;
};

export async function handleQueueBatch(batch: QueueBatchLike<JobEnvelope>, env: Env): Promise<void> {
  for (const message of batch.messages) {
    const job = message.body;
    try {
      await updateJobStatus(env.DB, job.id, "running", job.attempt, { payloadStored: false });
      const result = await executeJobEnvelope(env, job);
      if (!env.CACHE) throw new Error("JOB_RESULT_STORE_UNAVAILABLE");
      await putJobResult(env.CACHE, {
        jobId: job.id,
        organizationId: job.organizationId,
        appId: job.appId,
        result,
        ttlSeconds: 3600,
      });
      await updateJobStatus(env.DB, job.id, "succeeded", job.attempt, {
        payloadStored: false,
        resultStored: true,
        resultTtlSeconds: 3600,
      });
      message.ack();
    } catch (error) {
      const code = errorCode(error);
      try {
        const retryJob = nextAttempt(job);
        if (!env.JOBS) throw new Error("JOB_QUEUE_UNAVAILABLE");
        await env.JOBS.send(retryJob, { delaySeconds: retryDelaySeconds(retryJob.attempt) });
        await updateJobStatus(env.DB, job.id, "queued", retryJob.attempt, {
          payloadStored: false,
          lastError: code,
          retryScheduled: true,
        });
      } catch {
        await updateJobStatus(env.DB, job.id, "dead_lettered", job.attempt, {
          payloadStored: false,
          lastError: code,
        });
        if (env.JOBS_DLQ) {
          await env.JOBS_DLQ.send({ job, error: code });
        }
      }
      message.ack();
    }
  }
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
    let d1 = "ready";
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
    } catch {
      d1 = "degraded";
    }
    const providers = {
      cloudflare: "ready",
      groq: env.GROQ_API_KEY ? "ready" : "unconfigured",
      gemini: env.GEMINI_API_KEY ? "lab" : "unconfigured",
      mistral: env.MISTRAL_API_KEY ? "lab" : "unconfigured",
    };
    const state = d1 === "ready" ? "operational" : "degraded";
    return json({
      ok: state === "operational",
      state,
      service: "nestai",
      billingMode: env.AI_BILLING_MODE,
      appCheck: env.APP_CHECK_REQUIRED === "true" ? "required" : "optional",
      layers: {
        edge: "ready",
        auth: "ready",
        config: "ready",
        d1,
        kv: env.CACHE && env.AI_CACHE_ENABLED === "true" ? "ready" : "unconfigured",
        queue: env.JOBS && env.AI_JOBS_ENABLED === "true" ? "ready" : "unconfigured",
        vectorize: env.VECTORIZE && env.AI_VECTORIZE_ENABLED === "true"
          ? "ready"
          : env.AI_VECTORIZE_ENABLED === "false" ? "blocked" : "unconfigured",
        r2: env.KNOWLEDGE_BUCKET && env.AI_R2_WRITES_ENABLED === "true"
          ? "ready"
          : env.AI_R2_WRITES_ENABLED === "false" ? "write_locked" : "unconfigured",
      },
      providers,
    });
  }

  if (request.method === "GET" && url.pathname === "/v1/health/providers") {
    const [groq, gemini, mistral] = await Promise.all([
      cachedProviderProbe(env, "groq"),
      cachedProviderProbe(env, "gemini"),
      cachedProviderProbe(env, "mistral"),
    ]);
    return json({
      ok: true,
      service: "nestai",
      billingMode: env.AI_BILLING_MODE,
      probes: { groq, gemini, mistral },
    });
  }

  if (request.method === "POST" && url.pathname === "/v1/apps/register") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    try {
      const authorization = request.headers.get("authorization");
      if (!authorization?.startsWith("Bearer ")) throw new Error("WORKLOAD_AUTH_MISSING");
      const raw = await request.json();
      const manifest = validateAppManifest(raw);
      assertManifestTaskOwnership(manifest);
      const claims = await verifyGitHubWorkloadToken(authorization.slice(7), {
        audience: "nestai-app-register",
        repositoryOwner: "prdanielcunha",
        expectedRepository: manifest.owner.repository,
      });
      await persistAppManifest(env.DB, manifest, { ...(claims.ref ? { ref: claims.ref } : {}), ...(claims.sha ? { sha: claims.sha } : {}) });
      return json({
        requestId,
        registered: true,
        appId: manifest.appId,
        manifestVersion: manifest.schemaVersion,
        repository: manifest.owner.repository,
        tasks: manifest.ai.tasks,
      });
    } catch (error) {
      const code = errorCode(error);
      const status = code.startsWith("WORKLOAD_") ? 401 : code.startsWith("APP_MANIFEST_") ? 422 : 400;
      return json({ requestId, error: code }, status);
    }
  }

  if (request.method === "GET" && url.pathname.startsWith("/v1/admin/")) {
    try {
      await authenticateAdminRequest(request, env);
      if (url.pathname === "/v1/admin/overview") return json(await buildMissionControlOverview(env.DB));
      if (url.pathname === "/v1/admin/apps") return json({ apps: controlPlaneApps() });
      if (url.pathname === "/v1/admin/tasks") return json({ tasks: controlPlaneTasks() });
      if (url.pathname === "/v1/admin/providers") return json({ providers: controlPlaneProviders() });
      if (url.pathname === "/v1/admin/routes") return json({ routes: controlPlaneRoutes() });
      if (url.pathname === "/v1/admin/prompts") return json({ prompts: controlPlanePrompts() });
      if (url.pathname === "/v1/admin/knowledge") return json(await controlPlaneKnowledge(env.DB));
      if (url.pathname === "/v1/admin/evals") return json(await controlPlaneEvaluations(env.DB));
      if (url.pathname === "/v1/admin/observability") return json(await controlPlaneObservability(env.DB));
      if (url.pathname === "/v1/admin/cost") return json(await controlPlaneCostQuota(env.DB));
      if (url.pathname === "/v1/admin/policies") return json({ policies: controlPlanePolicies() });
      if (url.pathname === "/v1/admin/audit") return json({ events: await controlPlaneAudit(env.DB, Number(url.searchParams.get("limit") ?? 100)) });
      return json({ error: "NOT_FOUND" }, 404);
    } catch (error) {
      const code = errorCode(error);
      return json({ error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/admin/knowledge/ingest") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    try {
      await authenticateAdminRequest(request, env);
      if (env.AI_VECTORIZE_ENABLED !== "true" || !env.VECTORIZE) throw new Error("RAG_VECTORIZE_UNAVAILABLE");
      const raw = await request.json();
      const input = KnowledgeIngestRequest.parse(raw);
      const privacy = classifyPrivacy(input.text, input.sensitivity);
      if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

      const providerUsage = await getDimensionalUsage(env.DB, {
        scopeType: "provider",
        scopeId: "cloudflare",
        provider: "cloudflare",
      });
      assertProviderFreeQuota("cloudflare", providerUsage.provider_calls, "background");

      const embedded = await upsertKnowledge({
        vectorize: env.VECTORIZE,
        sourceId: input.sourceId,
        appId: input.appId,
        organizationId: input.organizationId,
        sensitivity: privacy.sensitivity,
        locale: input.locale,
        ...(input.title ? { title: input.title } : {}),
        ...(input.locatorPrefix ? { locatorPrefix: input.locatorPrefix } : {}),
        text: input.text,
        embed: async (texts) => {
          const vectors: number[][] = [];
          for (let index = 0; index < texts.length; index += 32) {
            const batch = texts.slice(index, index + 32);
            const chunkVectors = await embedWithCloudflare(env.AI, "@cf/google/embeddinggemma-300m", batch);
            vectors.push(...chunkVectors);
            await incrementDimensionalUsage(env.DB, [
              { scopeType: "provider", scopeId: "cloudflare", provider: "cloudflare", task: "rag.ingest" },
              { scopeType: "app", scopeId: input.appId, provider: "cloudflare", task: "rag.ingest" },
              { scopeType: "organization", scopeId: input.organizationId, provider: "cloudflare", task: "rag.ingest" },
            ]);
          }
          return vectors;
        },
      });
      let sourcePayloadStored = false;
      let sourceObjectKey: string | null = null;
      let r2QuotaHealth: string | null = null;

      if (env.AI_R2_WRITES_ENABLED === "true" && env.KNOWLEDGE_BUCKET) {
        try {
          const orgHash = await ragOrganizationHash(input.organizationId);
          const scopedSourceId = await ragScopedSourceId(input.organizationId, input.appId, input.sourceId);
          sourceObjectKey = "knowledge/" + orgHash + "/" + input.appId + "/" + scopedSourceId + ".txt";
          await putR2Object(env.KNOWLEDGE_BUCKET, env.DB, {
            key: sourceObjectKey,
            value: input.text,
            sizeBytes: r2Utf8Size(input.text),
            category: "knowledge",
            priority: "background",
            options: {
              httpMetadata: { contentType: "text/plain; charset=utf-8" },
              customMetadata: {
                appId: input.appId,
                sensitivity: privacy.sensitivity,
                locale: input.locale,
              },
            },
          });
          sourcePayloadStored = true;
          r2QuotaHealth = (await getR2Usage(env.DB)).health;
        } catch (r2Error) {
          const r2Code = errorCode(r2Error);
          if (!r2Code.startsWith("R2_")) throw r2Error;
          await recordRuntimeEvent(env.DB, {
            id: crypto.randomUUID(),
            eventType: "r2_degraded",
            appId: input.appId,
            task: "rag.ingest",
            organizationHash: await ragOrganizationHash(input.organizationId),
          });
        }
      }

      await persistKnowledgeSource(env.DB, {
        sourceId: input.sourceId,
        appId: input.appId,
        organizationId: input.organizationId,
        sensitivity: privacy.sensitivity,
        locale: input.locale,
        status: "ready",
        chunks: embedded.chunks,
        metadata: {
          title: input.title ?? null,
          locatorPrefix: input.locatorPrefix ?? null,
          sourcePayloadStored,
          sourceObjectKey,
        },
      });
      return json({
        requestId,
        sourceId: input.sourceId,
        status: "ready",
        chunks: embedded.chunks,
        storage: {
          r2: sourcePayloadStored ? "stored" : "degraded",
          quotaHealth: r2QuotaHealth,
        },
      }, 201);
    } catch (error) {
      const code = errorCode(error);
      const status = code.startsWith("RAG_") ? 503 : statusFor(code);
      return json({ requestId, error: code }, status);
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/rag/query") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    try {
      if (env.AI_VECTORIZE_ENABLED !== "true" || !env.VECTORIZE) throw new Error("RAG_VECTORIZE_UNAVAILABLE");
      const raw = await request.json();
      const input = RagQueryRequest.parse(raw);
      const task = getTask(input.task);
      if (task.modality !== "text" || task.rag !== true) throw new Error("RAG_TASK_NOT_ALLOWED");
      assertKillSwitches(task, env);

      const organizationId = input.context.organizationId;
      const claims = await authenticateRequest({ request, env, task, organizationId });
      const rate = await env.AI_RATE_LIMITER.limit({ key: claims.organizationId + ":" + claims.sub });
      if (!rate.success) throw new Error("RATE_LIMITED");

      const privacy = classifyPrivacy(input.query, task.defaultSensitivity);
      assertGuestSensitivity(claims, privacy.sensitivity);
      if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

      await recordProviderAttempt(env, claims, task, organizationId, "cloudflare");
      const [queryVector] = await embedWithCloudflare(env.AI, "@cf/google/embeddinggemma-300m", input.query);
      if (!queryVector) throw new Error("RAG_QUERY_EMBEDDING_EMPTY");

      const evidence = await queryKnowledge({
        vectorize: env.VECTORIZE,
        appId: task.app,
        organizationId,
        maxSensitivity: task.defaultSensitivity,
        locale: input.context.locale,
        queryVector,
        ...(input.topK !== undefined ? { topK: input.topK } : {}),
      });

      const parsed = TaskRequest.parse({
        task: task.id,
        input: input.query,
        context: {
          organizationId,
          locale: input.context.locale,
        },
      });
      const prepared: PreparedTaskExecution = {
        parsed,
        task,
        organizationId,
        claims,
        sensitivity: privacy.sensitivity,
        locale: input.context.locale,
      };
      const candidates = await safeCandidates(env, prepared, "text");
      const prompt = buildTaskPrompt({
        taskId: task.id,
        locale: input.context.locale,
        input: input.query,
        evidence: evidence.map((item) => ({
          text: item.text,
          evidence: item.evidence,
        })),
      });
      const execution = await executeWithSafeFallback({
        candidates,
        keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
        breaker,
        maxRetriesPerCandidate: 1,
        execute: async ({ candidate }) => {
          await recordProviderAttempt(env, claims, task, organizationId, candidate.provider);
          return withTimeout(
            (signal) => generateForRoute(env, {
              route: candidate,
              messages: prompt.messages,
              maxTokens: task.maxOutputTokens,
              signal,
            }),
            task.timeoutMs,
          );
        },
      });

      const trace = await safeTrace({
        traceId: requestId,
        task: task.id,
        appId: task.app,
        organizationId,
        sensitivity: privacy.sensitivity,
        provider: execution.result.provider,
        model: execution.result.model,
        promptVersion: prompt.promptVersion,
        durationMs: Date.now() - started,
        fallbackUsed: execution.fallbackUsed,
        retries: execution.retries,
        cached: false,
        outputValidation: "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);

      return json({
        requestId,
        task: task.id,
        version: task.version,
        result: {
          answer: execution.result.text,
          evidenceRefs: evidence.map((item) => item.evidence),
        },
        meta: {
          providerClass: "free",
          cached: false,
          fallbackUsed: execution.fallbackUsed,
          retries: execution.retries,
        },
      });
    } catch (error) {
      const code = errorCode(error);
      const status = code.startsWith("RAG_") ? 503 : statusFor(code);
      return json({ requestId, error: code }, status);
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/jobs") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    try {
      if (env.AI_JOBS_ENABLED !== "true" || !env.JOBS || !env.CACHE) throw new Error("JOB_QUEUE_UNAVAILABLE");
      const raw = await request.json();
      const parsed = TaskRequest.parse(raw);
      const task = getTask(parsed.task);
      assertKillSwitches(task, env);
      if (task.priority !== "background") throw new Error("JOB_TASK_NOT_BACKGROUND");

      const organizationId = parsed.context.organizationId;
      if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");
      const claims = await authenticateRequest({ request, env, task, organizationId });
      if (claims.tokenType === "guest") throw new Error("AUTH_GUEST_JOBS_DENIED");

      const rate = await env.AI_RATE_LIMITER.limit({ key: claims.organizationId + ":" + claims.sub });
      if (!rate.success) throw new Error("RATE_LIMITED");

      const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
  assertGuestSensitivity(claims, privacy.sensitivity);
      if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

      const serialized = JSON.stringify(parsed.input);
      if (new TextEncoder().encode(serialized).byteLength > 96_000) {
        throw new Error("JOB_PAYLOAD_TOO_LARGE");
      }

      const job = createJob({
        organizationId,
        appId: task.app,
        task: task.id,
        payload: parsed.input,
        locale: (parsed.context.locale ?? claims.locale ?? "pt-BR") as Locale,
      });
      await enqueueJob(env.JOBS, env.DB, job);
      return json({
        requestId,
        jobId: job.id,
        status: "queued",
        statusUrl: "/v1/jobs/" + job.id,
      }, 202);
    } catch (error) {
      const code = errorCode(error);
      const status = code.startsWith("JOB_") ? 422 : statusFor(code);
      return json({ requestId, error: code }, status);
    }
  }

  const jobMatch = request.method === "GET" ? url.pathname.match(/^\/v1\/jobs\/([0-9a-f-]{36})$/i) : null;
  if (jobMatch?.[1]) {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    try {
      const claims = await authenticateScopedRequest(request, env);
      const record = await getJobForScope(env.DB, {
        jobId: jobMatch[1],
        organizationId: claims.organizationId,
        appId: claims.appId,
      });
      if (!record) return json({ requestId, error: "JOB_NOT_FOUND" }, 404);
      const result = record.status === "succeeded" && env.CACHE
        ? await getJobResult<unknown>(env.CACHE, {
            jobId: record.jobId,
            organizationId: claims.organizationId,
            appId: claims.appId,
          })
        : null;
      return json({
        requestId,
        job: {
          id: record.jobId,
          task: record.taskId,
          status: record.status,
          attempt: record.attempt,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          ...(result !== null ? { result } : {}),
        },
      });
    } catch (error) {
      const code = errorCode(error);
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/transcribe") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    try {
      const prepared = await prepareTaskExecution(request, env, "audio");
      const input = AudioInput.parse(prepared.parsed.input);
      const candidates = await safeCandidates(env, prepared, "audio");

      const execution = await executeWithSafeFallback({
        candidates,
        keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
        breaker,
        maxRetriesPerCandidate: 1,
        execute: async ({ candidate }) => {
          await recordProviderAttempt(env, prepared.claims, prepared.task, prepared.organizationId, candidate.provider);
          if (candidate.provider === "cloudflare") {
            return withTimeout(
              () => transcribeWithCloudflare(env.AI, candidate.providerModelId, input.audioBase64, input.language),
              prepared.task.timeoutMs,
            );
          }
          if (candidate.provider === "groq") {
            return withTimeout(
              (signal) => transcribeWithGroq(env.GROQ_API_KEY ?? "", candidate.providerModelId, {
                audioBase64: input.audioBase64,
                mimeType: input.mimeType,
                ...(input.fileName ? { fileName: input.fileName } : {}),
                ...(input.language ? { language: input.language } : {}),
                signal,
              }),
              prepared.task.timeoutMs,
            );
          }
          throw new Error("PROVIDER_MODALITY_UNSUPPORTED");
        },
      });

      const trace = await safeTrace({
        traceId: requestId,
        task: prepared.task.id,
        appId: prepared.task.app,
        organizationId: prepared.organizationId,
        sensitivity: prepared.sensitivity,
        provider: execution.candidate.provider,
        model: execution.candidate.providerModelId,
        durationMs: Date.now() - started,
        fallbackUsed: execution.fallbackUsed,
        retries: execution.retries,
        cached: false,
        outputValidation: "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);
      return json({
        requestId,
        task: prepared.task.id,
        version: prepared.task.version,
        result: execution.result,
        meta: { providerClass: "free", cached: false, fallbackUsed: execution.fallbackUsed, retries: execution.retries },
      });
    } catch (error) {
      const code = errorCode(error);
      console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, modality: "audio" }));
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/vision") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    try {
      const prepared = await prepareTaskExecution(request, env, "vision");
      const input = VisionInput.parse(prepared.parsed.input);

      // Conversion is intentionally Cloudflare-only for P3-capable OCR/document parsing.
      await recordProviderAttempt(env, prepared.claims, prepared.task, prepared.organizationId, "cloudflare");
      const convertedInput = "files" in input
        ? await withTimeout(
            () => extractDocumentsTextWithCloudflare(env.AI, {
              files: input.files.map((file) => ({
                base64: file.fileBase64,
                mimeType: file.mimeType,
                fileName: file.fileName,
                ...(file.label ? { label: file.label } : {}),
              })),
              locale: prepared.locale,
            }),
            Math.min(prepared.task.timeoutMs, 25_000),
          )
        : [await withTimeout(
            () => extractDocumentTextWithCloudflare(env.AI, {
              base64: input.fileBase64,
              mimeType: input.mimeType,
              fileName: input.fileName,
              locale: prepared.locale,
            }),
            Math.min(prepared.task.timeoutMs, 25_000),
          ).then((item) => ({
            fileName: input.fileName,
            ...("label" in input && input.label ? { label: input.label } : {}),
            text: item.text,
            ...(item.tokens !== undefined ? { tokens: item.tokens } : {}),
          }))];

      const structured = getStructuredContract(prepared.task.id);
      const textCandidates = await safeCandidates(env, prepared, "text", structured !== null);
      const prompt = buildTaskPrompt({
        taskId: prepared.task.id,
        locale: prepared.locale,
        input: {
          files: convertedInput.map(({ fileName, label, text }) => ({
            fileName,
            ...(label ? { label } : {}),
            extractedText: text,
          })),
          context: input.context ?? {},
        },
      });

      const execution = await executeWithSafeFallback({
        candidates: textCandidates,
        keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
        breaker,
        maxRetriesPerCandidate: 1,
        execute: async ({ candidate }) => {
          await recordProviderAttempt(env, prepared.claims, prepared.task, prepared.organizationId, candidate.provider);
          return withTimeout(
            (signal) => generateForRoute(env, {
              route: candidate,
              messages: prompt.messages,
              maxTokens: prepared.task.maxOutputTokens,
              responseSchema: structured?.jsonSchema,
              signal,
            }),
            prepared.task.timeoutMs,
          );
        },
      });

      const result = validateStructuredText(prepared.task.id, execution.result.text);
      const trace = await safeTrace({
        traceId: requestId,
        task: prepared.task.id,
        appId: prepared.task.app,
        organizationId: prepared.organizationId,
        sensitivity: prepared.sensitivity,
        provider: execution.candidate.provider,
        model: execution.candidate.providerModelId,
        promptVersion: prompt.promptVersion,
        durationMs: Date.now() - started,
        fallbackUsed: execution.fallbackUsed,
        retries: execution.retries,
        cached: false,
        outputValidation: structured ? "passed" : "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);
      return json({
        requestId,
        task: prepared.task.id,
        version: prepared.task.version,
        result,
        meta: {
          providerClass: "free",
          cached: false,
          fallbackUsed: execution.fallbackUsed,
          retries: execution.retries,
          humanReviewRequired: prepared.task.id === "journey.form.extract",
        },
      });
    } catch (error) {
      const code = errorCode(error);
      console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, modality: "vision" }));
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/embeddings") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    try {
      const prepared = await prepareTaskExecution(request, env, "embedding");
      const input = EmbeddingInput.parse(prepared.parsed.input);
      const [candidate] = await safeCandidates(env, prepared, "embedding");
      if (!candidate || candidate.provider !== "cloudflare") throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
      await recordProviderAttempt(env, prepared.claims, prepared.task, prepared.organizationId, candidate.provider);
      const vectors = await withTimeout(
        () => embedWithCloudflare(env.AI, candidate.providerModelId, input.texts),
        prepared.task.timeoutMs,
      );
      const trace = await safeTrace({
        traceId: requestId,
        task: prepared.task.id,
        appId: prepared.task.app,
        organizationId: prepared.organizationId,
        sensitivity: prepared.sensitivity,
        provider: candidate.provider,
        model: candidate.providerModelId,
        durationMs: Date.now() - started,
        fallbackUsed: false,
        retries: 0,
        cached: false,
        outputValidation: "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);
      return json({
        requestId,
        task: prepared.task.id,
        version: prepared.task.version,
        result: { vectors, dimensions: vectors[0]?.length ?? 0 },
        meta: { providerClass: "free", cached: false, fallbackUsed: false, retries: 0 },
      });
    } catch (error) {
      const code = errorCode(error);
      console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, modality: "embedding" }));
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/image") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();
    try {
      const prepared = await prepareTaskExecution(request, env, "image");
      const input = ImageInput.parse(prepared.parsed.input);
      const [candidate] = await safeCandidates(env, prepared, "image");
      if (!candidate || candidate.provider !== "cloudflare") throw new Error("ROUTER_NO_ELIGIBLE_MODEL");

      const imageUsage = await getDimensionalUsage(env.DB, {
        scopeType: "provider",
        scopeId: candidate.provider,
        provider: candidate.provider,
        task: prepared.task.id,
      });
      if (imageUsage.provider_calls >= 20) throw new Error("COST_GUARD_IMAGE_DAILY_LIMIT");

      await recordProviderAttempt(env, prepared.claims, prepared.task, prepared.organizationId, candidate.provider);
      const result = await withTimeout(
        () => generateImageWithCloudflare(env.AI, candidate.providerModelId, { prompt: input.prompt, ...(input.steps !== undefined ? { steps: input.steps } : {}), ...(input.seed !== undefined ? { seed: input.seed } : {}) }),
        prepared.task.timeoutMs,
      );
      const trace = await safeTrace({
        traceId: requestId,
        task: prepared.task.id,
        appId: prepared.task.app,
        organizationId: prepared.organizationId,
        sensitivity: prepared.sensitivity,
        provider: candidate.provider,
        model: candidate.providerModelId,
        durationMs: Date.now() - started,
        fallbackUsed: false,
        retries: 0,
        cached: false,
        outputValidation: "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);
      return json({
        requestId,
        task: prepared.task.id,
        version: prepared.task.version,
        result,
        meta: { providerClass: "free", cached: false, fallbackUsed: false, retries: 0 },
      });
    } catch (error) {
      const code = errorCode(error);
      console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, modality: "image" }));
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method === "POST" && url.pathname === "/v1/chat/stream") {
    const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
    const started = Date.now();

    try {
      const raw = await request.json();
      const parsed = TaskRequest.parse(raw);
      const task = getTask(parsed.task);
      assertKillSwitches(task, env);
      if (!task.streaming) throw new Error("STREAM_NOT_ALLOWED_FOR_TASK");
      if (getStructuredContract(task.id)) throw new Error("STREAM_STRUCTURED_OUTPUT_UNSUPPORTED");

      const organizationId = parsed.context.organizationId;
      if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");

      const claims = await authenticateRequest({ request, env, task, organizationId });
      requireCapability(claims, "ai:stream");

      const rate = await env.AI_RATE_LIMITER.limit({ key: claims.organizationId + ":" + claims.sub });
      if (!rate.success) {
      await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "rate_limited", appId: task.app, task: task.id });
      throw new Error("RATE_LIMITED");
    }

      const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
  assertGuestSensitivity(claims, privacy.sensitivity);
      if (!privacy.externalAllowed) {
      await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "privacy_rejected", appId: task.app, task: task.id });
      throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");
    }

      const candidates = routeCandidates({
        sensitivity: privacy.sensitivity,
        billingMode: env.AI_BILLING_MODE,
        modality: task.modality,
        allowedProviders: task.allowedProviders,
        blockedProviders: task.blockedProviders,
        availableProviders: availableProviders(env),
      });
      if (candidates.length === 0) throw new Error("ROUTER_NO_ELIGIBLE_MODEL");

      const quotaCandidates = await quotaEligibleCandidates(env, claims, task, organizationId, candidates);
      const locale = (parsed.context.locale ?? claims.locale ?? "pt-BR") as Locale;
      const prompt = buildTaskPrompt({ taskId: task.id, locale, input: parsed.input });

      const execution = await executeWithSafeFallback({
        candidates: quotaCandidates,
        keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
        breaker,
        maxRetriesPerCandidate: 1,
        execute: async ({ candidate }) => {
          await recordProviderAttempt(env, claims, task, organizationId, candidate.provider);
          return withTimeout(
            (signal) => streamForRoute(env, {
              route: candidate,
              messages: prompt.messages,
              maxTokens: task.maxOutputTokens,
              signal,
            }),
            Math.min(task.timeoutMs, 5_000),
          );
        },
      });

      const upstream = execution.result[Symbol.asyncIterator]();
      const deadline = Date.now() + task.timeoutMs;
      let firstDeltaAt: number | undefined;
      let completed = false;

      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(sse("start", {
            requestId,
            task: task.id,
            version: task.version,
          }));

          void (async () => {
            try {
              while (true) {
                const item = await nextWithDeadline(upstream, deadline, request.signal);
                if (item.done) break;
                if (firstDeltaAt === undefined) firstDeltaAt = Date.now();
                controller.enqueue(sse("delta", { text: item.value }));
              }

              controller.enqueue(sse("usage", {
                providerClass: "free",
                fallbackUsed: execution.fallbackUsed,
                retries: execution.retries,
              }));
              controller.enqueue(sse("complete", { requestId }));
              completed = true;

              const trace = await safeTrace({
                traceId: requestId,
                task: task.id,
                appId: task.app,
                organizationId,
                sensitivity: privacy.sensitivity,
                provider: execution.candidate.provider,
                model: execution.candidate.providerModelId,
                promptVersion: prompt.promptVersion,
                durationMs: Date.now() - started,
                ttftMs: firstDeltaAt === undefined ? undefined : firstDeltaAt - started,
                fallbackUsed: execution.fallbackUsed,
                retries: execution.retries,
                cached: false,
                outputValidation: "not_required",
                toolUsage: false,
                outcome: "success",
              });
              await emitTrace(env, trace);
              controller.close();
            } catch (error) {
              const code = errorCode(error);
              controller.enqueue(sse("error", { requestId, error: code }));
              console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, streaming: true }));
              controller.close();
            } finally {
              if (!completed && upstream.return) {
                try { await upstream.return(); } catch { /* best effort cancellation */ }
              }
            }
          })();
        },
        async cancel() {
          if (upstream.return) {
            try { await upstream.return(); } catch { /* best effort cancellation */ }
          }
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          "x-content-type-options": "nosniff",
        },
      });
    } catch (error) {
      const code = errorCode(error);
      console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started, streaming: true }));
      return json({ requestId, error: code }, statusFor(code));
    }
  }

  if (request.method !== "POST" || url.pathname !== "/v1/run") return json({ error: "NOT_FOUND" }, 404);

  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const started = Date.now();

  try {
    const raw = await request.json();
    const parsed = TaskRequest.parse(raw);
    const task = getTask(parsed.task);
    if (task.modality !== "text") throw new Error("USE_MODALITY_ENDPOINT");
    assertKillSwitches(task, env);

    const organizationId = parsed.context.organizationId;
    if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");

    const claims = await authenticateRequest({ request, env, task, organizationId });

    const rate = await env.AI_RATE_LIMITER.limit({ key: claims.organizationId + ":" + claims.sub });
    if (!rate.success) {
      await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "rate_limited", appId: task.app, task: task.id });
      throw new Error("RATE_LIMITED");
    }

    const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
  assertGuestSensitivity(claims, privacy.sensitivity);
    if (!privacy.externalAllowed) {
      await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "privacy_rejected", appId: task.app, task: task.id });
      throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");
    }

    assertGroundedEvidenceInput(task.id, parsed.input);
    const structuredContract = getStructuredContract(task.id);
    const locale = (parsed.context.locale ?? claims.locale ?? "pt-BR") as Locale;
    const prompt = buildTaskPrompt({ taskId: task.id, locale, input: parsed.input });
    const cacheContext = {
      taskId: task.id,
      taskVersion: task.version,
      promptVersion: prompt.promptVersion,
      policyVersion: 1,
      locale,
      organizationId,
      sensitivity: privacy.sensitivity,
      input: parsed.input,
    };
    const cachedResult = await cacheGet<unknown>(env.CACHE, cacheContext, task.cache.mode);
    if (cachedResult !== null) {
      const trace = await safeTrace({
        traceId: requestId,
        task: task.id,
        appId: task.app,
        organizationId,
        sensitivity: privacy.sensitivity,
        promptVersion: prompt.promptVersion,
        durationMs: Date.now() - started,
        fallbackUsed: false,
        retries: 0,
        cached: true,
        outputValidation: structuredContract ? "passed" : "not_required",
        toolUsage: false,
        outcome: "success",
      });
      await emitTrace(env, trace);
      return json({
        requestId,
        task: task.id,
        version: task.version,
        result: cachedResult,
        meta: { providerClass: "free", cached: true, fallbackUsed: false, retries: 0 },
      });
    }

    const candidates = routeCandidates({
      sensitivity: privacy.sensitivity,
      billingMode: env.AI_BILLING_MODE,
      modality: task.modality,
      allowedProviders: task.allowedProviders,
      blockedProviders: task.blockedProviders,
      availableProviders: availableProviders(env),
      needsStructuredOutput: structuredContract !== null,
    });
    if (candidates.length === 0) throw new Error("ROUTER_NO_ELIGIBLE_MODEL");

    const quotaCandidates = await quotaEligibleCandidates(env, claims, task, organizationId, candidates);

    const execution = await executeWithSafeFallback({
      candidates: quotaCandidates,
      keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate }) => {
        await recordProviderAttempt(env, claims, task, organizationId, candidate.provider);
        return withTimeout(
          (signal) => generateForRoute(env, {
            route: candidate,
            messages: prompt.messages,
            maxTokens: task.maxOutputTokens,
            responseSchema: structuredContract?.jsonSchema,
            signal,
          }),
          task.timeoutMs,
        );
      },
    });

    let outputValidation: "not_required" | "passed" | "failed" = structuredContract ? "passed" : "not_required";
    let result: unknown;
    try {
      result = validateStructuredText(task.id, execution.result.text);
      verifyGroundedEvidence(task.id, parsed.input, result);
    } catch (error) {
      outputValidation = "failed";
      throw error;
    }

    await cachePut(env.CACHE, cacheContext, task.cache.mode, task.cache.ttlSeconds, result);

    const trace = await safeTrace({
      traceId: requestId,
      task: task.id,
      appId: task.app,
      organizationId,
      sensitivity: privacy.sensitivity,
      provider: execution.result.provider,
      model: execution.result.model,
      promptVersion: prompt.promptVersion,
      durationMs: Date.now() - started,
      inputTokens: execution.result.usage?.inputTokens,
      outputTokens: execution.result.usage?.outputTokens,
      fallbackUsed: execution.fallbackUsed,
      retries: execution.retries,
      cached: false,
      outputValidation,
      toolUsage: false,
      outcome: "success",
    });
    await emitTrace(env, trace);

    return json({
      requestId,
      task: task.id,
      version: task.version,
      result,
      meta: {
        providerClass: "free",
        cached: false,
        fallbackUsed: execution.fallbackUsed,
        retries: execution.retries,
      },
    });
  } catch (error) {
    const code = errorCode(error);
    console.error(JSON.stringify({ requestId, code, durationMs: Date.now() - started }));
    return json({ requestId, error: code }, statusFor(code));
  }
}

export async function handleScheduled(_controller: unknown, env: Env): Promise<void> {
  await syncStaticControlPlane(env.DB);
  await evaluateSloAlerts(env.DB);

  const now = new Date();
  if (
    env.AI_R2_WRITES_ENABLED === "true" &&
    env.KNOWLEDGE_BUCKET &&
    now.getUTCHours() === 3 &&
    now.getUTCMinutes() < 15
  ) {
    try {
      await reconcileR2Inventory(env.KNOWLEDGE_BUCKET, env.DB, now);
    } catch (error) {
      await recordRuntimeEvent(env.DB, {
        id: crypto.randomUUID(),
        eventType: "r2_reconcile_failed",
        appId: "nestai",
        task: "storage.reconcile",
      }, now);
      console.error(JSON.stringify({ code: errorCode(error), task: "storage.reconcile" }));
    }
  }
}

const allowedBrowserOrigins = new Set([
  "https://ai.millionsnest.com",
  "https://millionsnest.com",
  "https://www.millionsnest.com",
  "https://musicscale.millionsnest.com",
  "https://nestfinance.millionsnest.com",
  "https://connect.millionsnest.com",
  "https://nestlocal.millionsnest.com",
  "https://nestjourney.millionsnest.com",
  "https://nestlume.millionsnest.com",
  "https://nestaffiliate.millionsnest.com",
]);

export async function handleBrowserRequest(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("origin");
  const corsAllowed = origin !== null && allowedBrowserOrigins.has(origin);
  const url = new URL(request.url);
  const isApi = url.pathname.startsWith("/v1/") || url.pathname === "/health";

  if (request.method === "OPTIONS" && isApi) {
    if (!corsAllowed) return new Response(null, { status: 403 });
    return new Response(null, {
      status: 204,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "authorization, content-type, accept, x-firebase-appcheck, x-millionsnest-app, x-millionsnest-org, x-request-id",
        "access-control-max-age": "600",
        "vary": "Origin",
        "cache-control": "no-store",
      },
    });
  }

  const response = await handleRequest(request, env);
  if (!corsAllowed || !isApi) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("vary", headers.has("vary") ? headers.get("vary") + ", Origin" : "Origin");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default { fetch: handleBrowserRequest, queue: handleQueueBatch, scheduled: handleScheduled };
