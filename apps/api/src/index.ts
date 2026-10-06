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
  type GenerateRequest,
  type GenerateResult,
  type WorkersAiBinding,
} from "../../../packages/providers/src/index.js";
import { assertWithinFreeBudget } from "../../../packages/cost-guard/src/index.js";
import { safeTrace } from "../../../packages/observability/src/index.js";
import { getUsage, incrementUsage, type D1DatabaseLike } from "../../../packages/usage-ledger/src/index.js";
import { buildTaskPrompt } from "../../../packages/prompt-registry/src/index.js";
import { getStructuredContract, validateStructuredText } from "../../../packages/structured-output/src/index.js";
import { CircuitBreaker, executeWithSafeFallback } from "../../../packages/resilience/src/index.js";
import type { Locale } from "../../../packages/i18n/src/index.js";

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

async function quotaEligibleCandidates(env: Env, organizationId: string, candidates: RouteDecision[]): Promise<RouteDecision[]> {
  const eligible: RouteDecision[] = [];
  for (const candidate of candidates) {
    const usage = await getUsage(env.DB, organizationId, candidate.provider);
    try {
      assertWithinFreeBudget(
        { requestsToday: usage.requests, providerCallsToday: usage.provider_calls },
        { maxRequestsPerDay: 900, maxProviderCallsPerDay: 900 },
      );
      eligible.push(candidate);
    } catch {
      continue;
    }
  }
  if (eligible.length === 0) throw new Error("COST_GUARD_PROVIDER_LIMIT");
  return eligible;
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && url.pathname === "/health") {
    return json({
      ok: true,
      service: "nestai",
      billingMode: env.AI_BILLING_MODE,
      appCheck: env.APP_CHECK_REQUIRED === "true" ? "required" : "optional",
      providers: {
        cloudflare: "ready",
        groq: env.GROQ_API_KEY ? "ready" : "unconfigured",
        gemini: env.GEMINI_API_KEY ? "lab" : "unconfigured",
        mistral: env.MISTRAL_API_KEY ? "lab" : "unconfigured",
      },
    });
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
    if (!rate.success) throw new Error("RATE_LIMITED");

    const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
    if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

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

    const quotaCandidates = await quotaEligibleCandidates(env, organizationId, candidates);
    const locale = (parsed.context.locale ?? claims.locale ?? "pt-BR") as Locale;
    const prompt = buildTaskPrompt({ taskId: task.id, locale, input: parsed.input });

    const execution = await executeWithSafeFallback({
      candidates: quotaCandidates,
      keyOf: (candidate) => candidate.provider + ":" + candidate.providerModelId,
      breaker,
      maxRetriesPerCandidate: 1,
      execute: async ({ candidate }) => {
        await incrementUsage(env.DB, organizationId, candidate.provider);
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
