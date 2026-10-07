import { describe, expect, it } from "vitest";
import { tasks } from "../../packages/task-registry/src/index.js";

describe("Gemini Free privacy boundary", () => {
  it("is eligible only for P0 public tasks", () => {
    for (const task of tasks) {
      if (task.allowedProviders.includes("gemini")) {
        expect(task.defaultSensitivity, task.id).toBe("P0_PUBLIC");
      }
      if (task.defaultSensitivity !== "P0_PUBLIC") {
        expect(task.blockedProviders, task.id).toContain("gemini");
      }
    }
  });
});
