export type JobEnvelope<T = unknown> = {
  id: string;
  organizationId: string;
  appId: string;
  task: string;
  payload: T;
  createdAt: string;
  attempt: number;
};

export function createJob<T>(input: Omit<JobEnvelope<T>, "id" | "createdAt" | "attempt">): JobEnvelope<T> {
  return {
    ...input,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    attempt: 0,
  };
}

export function nextAttempt<T>(job: JobEnvelope<T>): JobEnvelope<T> {
  if (job.attempt >= 4) throw new Error("JOB_MAX_ATTEMPTS");
  return { ...job, attempt: job.attempt + 1 };
}
