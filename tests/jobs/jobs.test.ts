import { describe, expect, it } from "vitest";
import { createJob, nextAttempt } from "../../packages/jobs/src/index.js";

describe("jobs", () => {
  it("creates tenant-scoped envelopes and bounds retries", () => {
    let job = createJob({ organizationId: "org-1", appId: "connect", task: "connect.reply.suggest", payload: { id: 1 } });
    expect(job.attempt).toBe(0);
    for (let i = 0; i < 4; i += 1) job = nextAttempt(job);
    expect(job.attempt).toBe(4);
    expect(() => nextAttempt(job)).toThrow("JOB_MAX_ATTEMPTS");
  });
});
