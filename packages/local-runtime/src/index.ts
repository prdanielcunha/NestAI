export type LocalAiCapability =
  | "language_detection"
  | "classification"
  | "embedding"
  | "normalization"
  | "pii_predetection";

export type LocalAiSupport = {
  browser: boolean;
  webgpu: boolean;
  wasm: boolean;
};

export type LocalAiAdapter = {
  capabilities: LocalAiCapability[];
  run<TInput = unknown, TResult = unknown>(
    capability: LocalAiCapability,
    input: TInput,
  ): Promise<TResult>;
};

export function detectLocalAiSupport(runtime: typeof globalThis = globalThis): LocalAiSupport {
  const navigatorValue = (runtime as typeof globalThis & { navigator?: Navigator & { gpu?: unknown } }).navigator;
  return {
    browser: typeof navigatorValue !== "undefined",
    webgpu: Boolean(navigatorValue && "gpu" in navigatorValue && navigatorValue.gpu),
    wasm: typeof WebAssembly !== "undefined",
  };
}

export function localCapabilityEligible(args: {
  enabled: boolean;
  capability: LocalAiCapability;
  adapter?: LocalAiAdapter | null;
  support?: LocalAiSupport;
}): boolean {
  if (!args.enabled || !args.adapter) return false;
  const support = args.support ?? detectLocalAiSupport();
  if (!support.browser || (!support.webgpu && !support.wasm)) return false;
  return args.adapter.capabilities.includes(args.capability);
}

export async function runLocalFirst<TResult>(args: {
  enabled: boolean;
  capability: LocalAiCapability;
  sensitivity: "P0_PUBLIC" | "P1_INTERNAL" | "P2_PERSONAL" | "P3_SENSITIVE" | "P4_RESTRICTED";
  adapter?: LocalAiAdapter | null;
  input: unknown;
  remote: () => Promise<TResult>;
  onLocalFailure?: (error: unknown) => void;
}): Promise<{ result: TResult; execution: "local" | "remote"; degraded: boolean }> {
  const eligible = localCapabilityEligible({
    enabled: args.enabled,
    capability: args.capability,
    adapter: args.adapter,
  });

  if (eligible && args.adapter) {
    try {
      const result = await args.adapter.run<unknown, TResult>(args.capability, args.input);
      return { result, execution: "local", degraded: false };
    } catch (error) {
      args.onLocalFailure?.(error);
      if (args.sensitivity === "P4_RESTRICTED") throw new Error("LOCAL_AI_REQUIRED_FOR_P4");
    }
  } else if (args.sensitivity === "P4_RESTRICTED") {
    throw new Error("LOCAL_AI_REQUIRED_FOR_P4");
  }

  return {
    result: await args.remote(),
    execution: "remote",
    degraded: eligible,
  };
}

export function normalizeTextLocally(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function preDetectPiiLocally(value: string): {
  detected: boolean;
  types: Array<"email" | "phone" | "cpf">;
} {
  const types: Array<"email" | "phone" | "cpf"> = [];
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(value)) types.push("email");
  if (/(?:\+?55\s*)?(?:\(?\d{2}\)?\s*)?9?\d{4}[-\s]?\d{4}/.test(value)) types.push("phone");
  if (/\b(?:\d{3}\.\d{3}\.\d{3}-\d{2}|\d{11})\b/.test(value)) types.push("cpf");
  return { detected: types.length > 0, types };
}
