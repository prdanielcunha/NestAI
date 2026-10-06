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

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, 16);
}

export async function safeTrace(input: Omit<TraceEvent, "organizationIdHash"> & { organizationId: string }): Promise<TraceEvent> {
  const { organizationId, ...rest } = input;
  return { ...rest, organizationIdHash: await digest(organizationId) };
}
