import { describe, expect, it } from "vitest";
import { releaseGate } from "../../packages/evals/src/index.js";
import { ecosystemApps, validateManifest } from "../../packages/app-registry/src/index.js";

describe("release eval gate", () => {
  it("fails empty or any explicitly failed suite", () => {
    expect(releaseGate([]).pass).toBe(false);
    expect(releaseGate([{ caseId: "a", passed: false, score: 1 }]).pass).toBe(false);
  });
  it("requires the minimum average", () => {
    expect(releaseGate([{ caseId: "a", passed: true, score: 0.95 }]).pass).toBe(true);
    expect(releaseGate([{ caseId: "a", passed: true, score: 0.8 }]).pass).toBe(false);
  });
});

describe("app registry", () => {
  it("keeps ecosystem manifests valid", () => {
    for (const app of ecosystemApps) expect(() => validateManifest(app)).not.toThrow();
  });
});
