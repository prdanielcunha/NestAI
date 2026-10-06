import { TaskRequest } from "../../../packages/contracts/src/index.js";
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
  type GenerateRequest,
  type GenerateResult,
  type WorkersAiBinding,
} from "../../../packages/providers/src/index.js";
import { assertProviderFreeQuota, assertWithinFreeBudget } from "../../../packages/cost-guard/src/index.js";
import { safeTrace } from "../../../packages/observability/src/index.js";
import { incrementUsage, getDimensionalUsage, incrementDimensionalUsage, recordRuntimeEvent, type D1DatabaseLike } from "../../../packages/usage-ledger/src/index.js";
import { buildTaskPrompt } from "../../../packages/prompt-registry/src/index.js";
import { getStructuredContract, validateStructuredText } from "../../../packages/structured-output/src/index.js";
import { CircuitBreaker, executeWithSafeFallback } from "../../../packages/resilience/src/index.js";
import type { Locale } from "../../../packages/i18n/src/index.js";
import { buildMissionControlOverview, controlPlaneApps, controlPlaneTasks, controlPlaneProviders, controlPlanePolicies, controlPlaneAudit, controlPlaneRoutes, controlPlanePrompts, controlPlaneKnowledge, controlPlaneEvaluations, controlPlaneObservability, controlPlaneCostQuota } from "../../../packages/control-plane/src/index.js";

type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

export type Env = {
  AI: WorkersAiBinding;
  AI_RATE_LIMITER: RateLimiter;
  DB: D1DatabaseLike;
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
  if (code.startsWith("COST_GUARD_") || code === "RATE_LIMITED") return 429;
  if (code.startsWith("PRIVACY_") || code.startsWith("OUTPUT_SCHEMA_") || code === "ROUTER_NO_ELIGIBLE_MODEL") return 422;
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
  if (request.route.provider === "cloudflare") return generateWithCloudflare(env.AI, request);
  if (request.route.provider === "groq") return generateWithGroq(env.GROQ_API_KEY ?? "", request);
  if (request.route.provider === "gemini") return generateWithGemini(env.GEMINI_API_KEY ?? "", request);
  if (request.route.provider === "mistral") return generateWithMistral(env.MISTRAL_API_KEY ?? "", request);
  throw new Error("PROVIDER_NOT_IMPLEMENTED");
}

async function streamForRoute(env: Env, request: GenerateRequest): Promise<AsyncIterable<string>> {
  if (request.route.provider === "cloudflare") return streamWithCloudflare(env.AI, request);
  if (request.route.provider === "groq") return streamWithGroq(env.GROQ_API_KEY ?? "", request);
  if (request.route.provider === "gemini") return streamWithGemini(env.GEMINI_API_KEY ?? "", request);
  if (request.route.provider === "mistral") return streamWithMistral(env.MISTRAL_API_KEY ?? "", request);
  throw new Error("PROVIDER_NOT_IMPLEMENTED");
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
      { scopeType: "app", scopeId: task.app, provider },
      { scopeType: "organization", scopeId: organizationId, provider },
      { scopeType: "user", scopeId: claims.sub, provider },
      { scopeType: "app", scopeId: task.app, provider, task: task.id },
      { scopeType: "organization", scopeId: organizationId, provider, task: task.id },
    ]),
  ]);
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
        kv: "unconfigured",
        queue: "unconfigured",
        vectorize: "unconfigured",
      },
      providers,
    });
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
              console.log(JSON.stringify(trace));
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
    if (!privacy.externalAllowed) {
      await recordRuntimeEvent(env.DB, { id: crypto.randomUUID(), eventType: "privacy_rejected", appId: task.app, task: task.id });
      throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");
    }

    const structuredContract = getStructuredContract(task.id);
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
    } catch (error) {
      outputValidation = "failed";
      throw error;
    }

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
    console.log(JSON.stringify(trace));

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

export default { fetch: handleRequest };
