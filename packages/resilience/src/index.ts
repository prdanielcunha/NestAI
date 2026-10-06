export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export type CircuitSnapshot = {
  state: CircuitState;
  consecutiveFailures: number;
  openedAt: number | null;
  lastFailureAt: number | null;
  lastSuccessAt: number | null;
};

export type CircuitConfig = {
  failureThreshold: number;
  openMs: number;
};

const defaultConfig: CircuitConfig = {
  failureThreshold: 3,
  openMs: 30_000,
};

export class CircuitBreaker {
  private readonly circuits = new Map<string, CircuitSnapshot>();

  constructor(private readonly config: CircuitConfig = defaultConfig) {}

  snapshot(key: string, now = Date.now()): CircuitSnapshot {
    const current = this.circuits.get(key) ?? {
      state: "CLOSED" as const,
      consecutiveFailures: 0,
      openedAt: null,
      lastFailureAt: null,
      lastSuccessAt: null,
    };

    if (current.state === "OPEN" && current.openedAt !== null && now - current.openedAt >= this.config.openMs) {
      const halfOpen: CircuitSnapshot = { ...current, state: "HALF_OPEN" };
      this.circuits.set(key, halfOpen);
      return halfOpen;
    }
    return current;
  }

  canAttempt(key: string, now = Date.now()): boolean {
    return this.snapshot(key, now).state !== "OPEN";
  }

  recordSuccess(key: string, now = Date.now()): void {
    this.circuits.set(key, {
      state: "CLOSED",
      consecutiveFailures: 0,
      openedAt: null,
      lastFailureAt: this.circuits.get(key)?.lastFailureAt ?? null,
      lastSuccessAt: now,
    });
  }

  recordFailure(key: string, now = Date.now()): void {
    const current = this.snapshot(key, now);
    const failures = current.consecutiveFailures + 1;
    const open = failures >= this.config.failureThreshold;
    this.circuits.set(key, {
      state: open ? "OPEN" : current.state === "HALF_OPEN" ? "OPEN" : "CLOSED",
      consecutiveFailures: failures,
      openedAt: open || current.state === "HALF_OPEN" ? now : null,
      lastFailureAt: now,
      lastSuccessAt: current.lastSuccessAt,
    });
  }
}

export function isTransientProviderError(error: unknown): boolean {
  const code = error instanceof Error ? error.message : String(error);
  if (/_(408|409|425|429|500|502|503|504)$/.test(code)) return true;
  return /TIMEOUT|CAPACITY|TEMPORARY|NETWORK|ECONNRESET|ETIMEDOUT/i.test(code);
}

export type FallbackAttempt<TCandidate> = {
  candidate: TCandidate;
  retry: number;
};

export async function executeWithSafeFallback<TCandidate, TResult>(args: {
  candidates: TCandidate[];
  keyOf: (candidate: TCandidate) => string;
  execute: (attempt: FallbackAttempt<TCandidate>) => Promise<TResult>;
  breaker: CircuitBreaker;
  maxRetriesPerCandidate?: number;
  onAttempt?: (attempt: FallbackAttempt<TCandidate>) => void;
}): Promise<{ result: TResult; candidate: TCandidate; fallbackUsed: boolean; retries: number }> {
  const maxRetries = args.maxRetriesPerCandidate ?? 1;
  let totalAttempts = 0;
  let lastError: unknown = new Error("ROUTER_NO_ELIGIBLE_MODEL");

  for (let candidateIndex = 0; candidateIndex < args.candidates.length; candidateIndex += 1) {
    const candidate = args.candidates[candidateIndex]!;
    const key = args.keyOf(candidate);
    if (!args.breaker.canAttempt(key)) continue;

    for (let retry = 0; retry <= maxRetries; retry += 1) {
      const attempt = { candidate, retry };
      args.onAttempt?.(attempt);
      totalAttempts += 1;
      try {
        const result = await args.execute(attempt);
        args.breaker.recordSuccess(key);
        return {
          result,
          candidate,
          fallbackUsed: candidateIndex > 0,
          retries: totalAttempts - 1,
        };
      } catch (error) {
        lastError = error;
        if (!isTransientProviderError(error)) throw error;
        args.breaker.recordFailure(key);
        if (retry >= maxRetries) break;
      }
    }
  }

  throw lastError;
}
