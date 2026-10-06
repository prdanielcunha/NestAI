import { describe, expect, it } from "vitest";
import { z } from "zod";
import { assertToolExecutionAllowed, type ToolDefinition } from "../../packages/tool-policy/src/index.js";

const writeTool: ToolDefinition<{ id: string }> = {
  id: "example.write",
  appId: "nestlocal",
  inputSchema: z.object({ id: z.string().min(1) }),
  impact: "write",
  approval: "user",
  requiredCapabilities: ["example:write"],
  enabled: true,
};

describe("tool authorization", () => {
  it("allows narrow reads/drafts only with required capability and app scope", () => {
    const tool: ToolDefinition<{ reportId: string }> = {
      id: "finance.report.read",
      appId: "nestfinance",
      inputSchema: z.object({ reportId: z.string().min(1) }),
      impact: "read",
      approval: "none",
      requiredCapabilities: ["finance:report:read"],
      enabled: true,
    };
    expect(assertToolExecutionAllowed(tool, { reportId: "r1" }, {
      appId: "nestfinance",
      capabilities: ["finance:report:read"],
      globalWritesEnabled: false,
    })).toEqual({ reportId: "r1" });
  });

  it("denies cross-app tool use", () => {
    expect(() => assertToolExecutionAllowed(writeTool, { id: "x" }, {
      appId: "connect",
      capabilities: ["example:write"],
      globalWritesEnabled: true,
      approval: "user",
    })).toThrow("TOOL_APP_SCOPE_DENIED");
  });

  it("denies writes while global write kill switch is off", () => {
    expect(() => assertToolExecutionAllowed(writeTool, { id: "x" }, {
      appId: "nestlocal",
      capabilities: ["example:write"],
      globalWritesEnabled: false,
      approval: "user",
    })).toThrow("TOOL_WRITES_DISABLED");
  });

  it("requires explicit approval for writes and admin approval for critical actions", () => {
    expect(() => assertToolExecutionAllowed(writeTool, { id: "x" }, {
      appId: "nestlocal",
      capabilities: ["example:write"],
      globalWritesEnabled: true,
    })).toThrow("TOOL_USER_APPROVAL_REQUIRED");

    const critical: ToolDefinition<{ id: string }> = {
      ...writeTool,
      id: "example.critical",
      impact: "critical",
      approval: "admin",
    };
    expect(() => assertToolExecutionAllowed(critical, { id: "x" }, {
      appId: "nestlocal",
      capabilities: ["example:write"],
      globalWritesEnabled: true,
      approval: "user",
    })).toThrow();
  });

  it("validates tool args before any execution", () => {
    expect(() => assertToolExecutionAllowed(writeTool, { id: "" }, {
      appId: "nestlocal",
      capabilities: ["example:write"],
      globalWritesEnabled: true,
      approval: "user",
    })).toThrow("TOOL_INPUT_SCHEMA_INVALID");
  });
});
