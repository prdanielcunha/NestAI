import { describe, expect, it } from "vitest";
import { classifyPrivacy } from "../../packages/privacy-firewall/src/index.js";

describe("privacy firewall", () => {
  it("never downgrades a task sensitivity floor", () => {
    expect(classifyPrivacy("public text", "P3_SENSITIVE").sensitivity).toBe("P3_SENSITIVE");
  });

  it("escalates obvious personal data", () => {
    const result = classifyPrivacy("contato: pessoa@example.com", "P0_PUBLIC");
    expect(result.sensitivity).toBe("P2_PERSONAL");
  });

  it("blocks restricted secrets from external providers", () => {
    const result = classifyPrivacy("API_KEY=super-secret-value", "P0_PUBLIC");
    expect(result.sensitivity).toBe("P4_RESTRICTED");
    expect(result.externalAllowed).toBe(false);
  });

  it("escalates Brazilian CPF-like identifiers to sensitive", () => {
    expect(classifyPrivacy("CPF 123.456.789-00", "P0_PUBLIC").sensitivity).toBe("P3_SENSITIVE");
  });
});
