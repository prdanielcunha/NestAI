import { TaskRequest } from "../../../packages/contracts/src/index.js";
import { verifyNestAiToken, requireCapability, readNestAiTokenHeader } from "../../../packages/auth/src/index.js";
import { classifyPrivacy } from "../../../packages/privacy-firewall/src/index.js";
import { getTask } from "../../../packages/task-registry/src/index.js";
import { routeModel } from "../../../packages/router/src/index.js";
import { generateWithCloudflare, generateWithGroq, type WorkersAiBinding } from "../../../packages/providers/src/index.js";
import { assertWithinFreeBudget } from "../../../packages/cost-guard/src/index.js";
import { safeTrace } from "../../../packages/observability/src/index.js";
import { getUsage, incrementUsage, type D1DatabaseLike } from "../../../packages/usage-ledger/src/index.js";

type RateLimiter = { limit(input: { key: string }): Promise<{ success: boolean }> };

export type Env = {
  AI: WorkersAiBinding;
  AI_RATE_LIMITER: RateLimiter;
  DB: D1DatabaseLike;
  GROQ_API_KEY?: string;
  HUB_JWKS_URL: string;
  HUB_TOKEN_ISSUER: string;
  NESTAI_TOKEN_AUDIENCE: string;
  AI_BILLING_MODE: "FREE_ONLY";
  ALLOW_PAID_FALLBACK: "false";
  AUTO_UPGRADE_PROVIDER: "false";
  AI_PAID_ENABLED: "false";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
}

function errorCode(error: unknown): string {
  return error instanceof Error ? error.message : "INTERNAL_ERROR";
}

function statusFor(code: string): number {
  if (code.startsWith("AUTH_")) return 401;
  if (code === "TASK_NOT_REGISTERED") return 404;
  if (code.startsWith("COST_GUARD_") || code === "RATE_LIMITED") return 429;
  if (code.startsWith("PRIVACY_") || code === "ROUTER_NO_ELIGIBLE_MODEL") return 422;
  return 500;
}

type JwksKey = JsonWebKey & { kid?: string; alg?: string; use?: string };
let jwksCache: { expiresAt: number; keys: JwksKey[] } | null = null;

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

function promptFrom(input: unknown): string {
  if (typeof input === "string") return input;
  return JSON.stringify(input);
}

export async function handleRequest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ ok: true, service: "nestai", billingMode: env.AI_BILLING_MODE, providers: { cloudflare: "ready", groq: env.GROQ_API_KEY ? "ready" : "unconfigured" } });
  }
  if (request.method !== "POST" || url.pathname !== "/v1/run") return json({ error: "NOT_FOUND" }, 404);

  const traceId = crypto.randomUUID();
  const started = Date.now();

  try {
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new Error("AUTH_MISSING_BEARER");

    const raw = await request.json();
    const parsed = TaskRequest.parse(raw);
    const task = getTask(parsed.task);
    const organizationId = parsed.context.organizationId;
    if (!organizationId) throw new Error("AUTH_TENANT_REQUIRED");

    const token = authorization.slice(7);
    const publicJwk = await resolveHubPublicJwk(token, env);
    const claims = await verifyNestAiToken(token, {
      issuer: env.HUB_TOKEN_ISSUER,
      audience: env.NESTAI_TOKEN_AUDIENCE,
      publicJwk,
      expectedOrganizationId: organizationId,
      expectedAppId: task.app,
    });
    requireCapability(claims, task.capability);

    const rate = await env.AI_RATE_LIMITER.limit({ key: `${claims.organizationId}:${claims.sub}` });
    if (!rate.success) throw new Error("RATE_LIMITED");

    const privacy = classifyPrivacy(parsed.input, task.defaultSensitivity);
    if (!privacy.externalAllowed) throw new Error("PRIVACY_RESTRICTED_EXTERNAL_BLOCK");

    const route = routeModel({
      sensitivity: privacy.sensitivity,
      billingMode: "FREE_ONLY",
      modality: task.modality,
      allowedProviders: task.allowedProviders,
      blockedProviders: task.blockedProviders,
      availableProviders: env.GROQ_API_KEY ? ["groq", "cloudflare"] : ["cloudflare"],
    });

    const usage = await getUsage(env.DB, organizationId, route.provider);
    assertWithinFreeBudget(
      { requestsToday: usage.requests, providerCallsToday: usage.provider_calls },
      { maxRequestsPerDay: 900, maxProviderCallsPerDay: 900 },
    );

    const generateRequest = {
      route,
      messages: [{ role: "user" as const, content: promptFrom(parsed.input) }],
      maxTokens: task.maxOutputTokens,
    };
    const result = route.provider === "cloudflare"
      ? await generateWithCloudflare(env.AI, generateRequest)
      : await generateWithGroq(env.GROQ_API_KEY ?? "", generateRequest);

    await incrementUsage(env.DB, organizationId, route.provider);

    const trace = await safeTrace({
      traceId,
      task: task.id,
      appId: task.app,
      organizationId,
      sensitivity: privacy.sensitivity,
      provider: result.provider,
      model: result.model,
      durationMs: Date.now() - started,
      outcome: "success",
    });
    console.log(JSON.stringify(trace));

    return json({
      traceId,
      output: result.text,
      route: { provider: result.provider, model: result.model },
      sensitivity: privacy.sensitivity,
      usage: result.usage,
    });
  } catch (error) {
    const code = errorCode(error);
    console.error(JSON.stringify({ traceId, code, durationMs: Date.now() - started }));
    return json({ traceId, error: code }, statusFor(code));
  }
}

export default { fetch: handleRequest };
