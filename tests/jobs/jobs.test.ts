import { describe, expect, it } from "vitest";
import { createJob, getJobResult, nextAttempt, putJobResult, retryDelaySeconds } from "../../packages/jobs/src/index.js";

describe("jobs", () => {
  it("creates tenant-scoped envelopes and bounds retries", () => {
    let job = createJob({ organizationId: "org-1", appId: "connect", task: "connect.reply.suggest", payload: { id: 1 } });
    expect(job.attempt).toBe(0);
    for (let i = 0; i < 4; i += 1) job = nextAttempt(job);
    expect(job.attempt).toBe(4);
    expect(() => nextAttempt(job)).toThrow("JOB_MAX_ATTEMPTS");
  });
});


  it("isolates transient job results by organization and app", async () => {
    const store = new Map<string, string>();
    const kv = {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string) => { store.set(key, value); },
      delete: async (key: string) => { store.delete(key); },
    };
    await putJobResult(kv, { jobId: "j1", organizationId: "org-1", appId: "connect", result: { ok: true } });
    await expect(getJobResult(kv, { jobId: "j1", organizationId: "org-1", appId: "connect" })).resolves.toEqual({ ok: true });
    await expect(getJobResult(kv, { jobId: "j1", organizationId: "org-2", appId: "connect" })).resolves.toBeNull();
    await expect(getJobResult(kv, { jobId: "j1", organizationId: "org-1", appId: "nestlocal" })).resolves.toBeNull();
  });

  it("backs off retries without unbounded delays", () => {
    expect(retryDelaySeconds(1)).toBe(10);
    expect(retryDelaySeconds(4)).toBe(80);
    expect(retryDelaySeconds(99)).toBe(300);
  });
