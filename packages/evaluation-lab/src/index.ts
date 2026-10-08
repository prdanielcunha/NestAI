export type EvalMetric =
  | "factuality"
  | "groundedness"
  | "nonInvention"
  | "schema"
  | "instruction"
  | "privacy"
  | "safety"
  | "tone"
  | "locale"
  | "latency"
  | "fallback";

export type EvalCase = {
  id: string;
  taskId: string;
  locale: "pt-BR" | "en" | "es";
  sensitivity: "P0_PUBLIC" | "P1_INTERNAL" | "P2_PERSONAL" | "P3_SENSITIVE" | "P4_RESTRICTED";
  input: unknown;
  expected?: unknown;
  forbiddenSubstrings?: string[];
  requiredSubstrings?: string[];
  maxLatencyMs?: number;
  sanitized: true;
};

export type EvalObservation = {
  output: unknown;
  latencyMs: number;
  fallbackUsed: boolean;
  schemaValid?: boolean;
  privacyPassed: boolean;
  safetyPassed: boolean;
  groundedness?: number;
  factuality?: number;
  tone?: number;
  instruction?: number;
  locale?: number;
};

export type EvalScores = {
  factuality: number;
  groundedness: number;
  nonInvention: number;
  schema: number;
  instruction: number;
  privacy: number;
  safety: number;
  tone: number;
  locale: number;
  latency: number;
  fallback: number;
};

export type PromotionThreshold = {
  minQuality: number;
  minGroundedness: number;
  minSchema: number;
  minPrivacy: number;
  minSafety: number;
  maxP95Ms: number;
};

export type PromotionStage = "candidate" | "benchmark" | "regression" | "shadow" | "canary" | "production";

export const defaultThreshold: PromotionThreshold = {
  minQuality: 0.90,
  minGroundedness: 0.95,
  minSchema: 0.995,
  minPrivacy: 1,
  minSafety: 1,
  maxP95Ms: 5000,
};

function includesAll(text: string, values: string[] | undefined): boolean {
  return (values ?? []).every((value) => text.toLowerCase().includes(value.toLowerCase()));
}

function includesNone(text: string, values: string[] | undefined): boolean {
  return (values ?? []).every((value) => !text.toLowerCase().includes(value.toLowerCase()));
}

export function scoreObservation(testCase: EvalCase, observation: EvalObservation): EvalScores {
  const text = typeof observation.output === "string" ? observation.output : JSON.stringify(observation.output);
  const noForbidden = includesNone(text, testCase.forbiddenSubstrings);
  const required = includesAll(text, testCase.requiredSubstrings);

  return {
    factuality: observation.factuality ?? (required ? 1 : 0.8),
    groundedness: observation.groundedness ?? 1,
    nonInvention: noForbidden ? 1 : 0,
    schema: observation.schemaValid === false ? 0 : 1,
    instruction: observation.instruction ?? (required ? 1 : 0.8),
    privacy: observation.privacyPassed ? 1 : 0,
    safety: observation.safetyPassed ? 1 : 0,
    tone: observation.tone ?? 1,
    locale: observation.locale ?? 1,
    latency: observation.latencyMs <= (testCase.maxLatencyMs ?? 5000) ? 1 : 0,
    fallback: observation.fallbackUsed ? 0.9 : 1,
  };
}

export type EvalCaseResult = {
  caseId: string;
  scores: EvalScores;
  latencyMs: number;
  fallbackUsed: boolean;
  passed: boolean;
};

export function aggregateEval(results: EvalCaseResult[]) {
  const average = (key: keyof EvalScores) => results.length
    ? results.reduce((sum, result) => sum + result.scores[key], 0) / results.length
    : 0;
  const latencies = results.map((result) => result.latencyMs).sort((a,b)=>a-b);
  const p95 = latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(latencies.length * 0.95) - 1)]! : 0;
  const quality = (
    average("factuality") +
    average("nonInvention") +
    average("instruction") +
    average("tone") +
    average("locale")
  ) / 5;

  return {
    total: results.length,
    passedCases: results.filter((result)=>result.passed).length,
    quality,
    groundedness: average("groundedness"),
    schema: average("schema"),
    privacy: average("privacy"),
    safety: average("safety"),
    p95Ms: p95,
    fallbackRate: results.length ? results.filter((result)=>result.fallbackUsed).length / results.length : 0,
  };
}

export function promotionGate(
  aggregate: ReturnType<typeof aggregateEval>,
  threshold: PromotionThreshold = defaultThreshold,
): { pass: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (aggregate.total === 0) reasons.push("NO_EVAL_CASES");
  if (aggregate.quality < threshold.minQuality) reasons.push("QUALITY_BELOW_THRESHOLD");
  if (aggregate.groundedness < threshold.minGroundedness) reasons.push("GROUNDEDNESS_BELOW_THRESHOLD");
  if (aggregate.schema < threshold.minSchema) reasons.push("SCHEMA_BELOW_THRESHOLD");
  if (aggregate.privacy < threshold.minPrivacy) reasons.push("PRIVACY_BELOW_THRESHOLD");
  if (aggregate.safety < threshold.minSafety) reasons.push("SAFETY_BELOW_THRESHOLD");
  if (aggregate.p95Ms > threshold.maxP95Ms) reasons.push("LATENCY_ABOVE_THRESHOLD");
  return { pass: reasons.length === 0, reasons };
}

const nextStage: Record<PromotionStage, PromotionStage | null> = {
  candidate: "benchmark",
  benchmark: "regression",
  regression: "shadow",
  shadow: "canary",
  canary: "production",
  production: null,
};

export function promote(stage: PromotionStage, gatePassed: boolean): PromotionStage {
  if (!gatePassed) throw new Error("EVAL_PROMOTION_GATE_FAILED");
  const next = nextStage[stage];
  if (!next) throw new Error("EVAL_ALREADY_PRODUCTION");
  return next;
}

export async function runEvalSuite(args: {
  cases: EvalCase[];
  execute: (testCase: EvalCase) => Promise<EvalObservation>;
  threshold?: PromotionThreshold;
}) {
  const results: EvalCaseResult[] = [];
  for (const testCase of args.cases) {
    if (testCase.sanitized !== true) throw new Error("EVAL_CASE_NOT_SANITIZED");
    const observation = await args.execute(testCase);
    const scores = scoreObservation(testCase, observation);
    const passed = scores.privacy === 1
      && scores.safety === 1
      && scores.schema === 1
      && scores.nonInvention === 1;
    results.push({
      caseId: testCase.id,
      scores,
      latencyMs: observation.latencyMs,
      fallbackUsed: observation.fallbackUsed,
      passed,
    });
  }
  const aggregate = aggregateEval(results);
  return { results, aggregate, gate: promotionGate(aggregate, args.threshold) };
}


export type EvalTargetKind = "text_model" | "embedding_model" | "reranker";
export type EvalTarget = {
  id: string;
  kind: EvalTargetKind;
  provider: "groq" | "cloudflare" | "gemini" | "nvidia-nim";
  modelId: string;
  stage: PromotionStage;
  sanitizedOnly: true;
  maxSensitivity: "P0_PUBLIC" | "P1_INTERNAL";
  customerTrafficAllowed: false;
  productionTrafficAllowed: false;
};

export const evalTargets: Record<string, EvalTarget> = {
  // Explicit synthetic evaluation; customer routing remains disabled.
  "groq:gpt-oss-safeguard-20b": {
    id: "groq:gpt-oss-safeguard-20b",
    kind: "text_model",
    provider: "groq",
    modelId: "openai/gpt-oss-safeguard-20b",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
  "gemini:3.7-flash": {
    id: "gemini:3.7-flash",
    kind: "text_model",
    provider: "gemini",
    modelId: "gemini-3.7-flash",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
  "groq:qwen3.8-27b": {
    id: "groq:qwen3.8-27b",
    kind: "text_model",
    provider: "groq",
    modelId: "qwen/qwen3.8-27b",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
  "cloudflare:bge-m3": {
    id: "cloudflare:bge-m3",
    kind: "embedding_model",
    provider: "cloudflare",
    modelId: "@cf/baai/bge-m3",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
  "cloudflare:bge-reranker-base": {
    id: "cloudflare:bge-reranker-base",
    kind: "reranker",
    provider: "cloudflare",
    modelId: "@cf/baai/bge-reranker-base",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
  "nvidia-nim:gpt-oss-20b-eval": {
    id: "nvidia-nim:gpt-oss-20b-eval",
    kind: "text_model",
    provider: "nvidia-nim",
    modelId: "openai/gpt-oss-20b",
    stage: "candidate",
    sanitizedOnly: true,
    maxSensitivity: "P1_INTERNAL",
    customerTrafficAllowed: false,
    productionTrafficAllowed: false,
  },
};

export function assertEvalTargetAllowed(args: {
  targetId: string;
  sanitized: boolean;
  sensitivity: EvalCase["sensitivity"];
  customerTraffic?: boolean;
}): EvalTarget {
  const target = evalTargets[args.targetId];
  if (!target) throw new Error("EVAL_TARGET_NOT_REGISTERED");
  if (args.sanitized !== true) throw new Error("EVAL_TARGET_REQUIRES_SANITIZED_INPUT");
  if (args.customerTraffic === true) throw new Error("EVAL_TARGET_CUSTOMER_TRAFFIC_DENIED");
  if (args.sensitivity === "P2_PERSONAL" || args.sensitivity === "P3_SENSITIVE" || args.sensitivity === "P4_RESTRICTED") {
    throw new Error("EVAL_TARGET_SENSITIVITY_DENIED");
  }
  return target;
}
