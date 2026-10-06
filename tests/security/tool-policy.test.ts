import { describe, expect, it } from "vitest";
import { assertToolExecutionAllowed } from "../../packages/tool-policy/src/index.js";

describe("AI tool policy", () => {
  it("allows an enabled read with capability", () => {
    expect(() => assertToolExecutionAllowed({ id: "x.read", requiredCapability: "x:read", risk: "read", enabled: true }, ["x:read"], false)).not.toThrow();
  });
  it("blocks writes while global writes are disabled", () => {
    expect(() => assertToolExecutionAllowed({ id: "x.write", requiredCapability: "x:write", risk: "reversible_write", enabled: true }, ["x:write"], false)).toThrow("TOOL_WRITES_DISABLED");
  });
  it("never directly authorizes irreversible writes", () => {
    expect(() => assertToolExecutionAllowed({ id: "x.delete", requiredCapability: "x:delete", risk: "irreversible_write", enabled: true }, ["x:delete"], true)).toThrow("TOOL_IRREVERSIBLE_REQUIRES_DOMAIN_CONFIRMATION");
  });
});
