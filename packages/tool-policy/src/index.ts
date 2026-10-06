import { z } from "zod";

export type ToolImpact = "read" | "draft" | "write" | "critical";
export type ToolApproval = "none" | "user" | "admin";

export type ToolDefinition<TInput = unknown> = {
  id: string;
  appId: string;
  inputSchema: z.ZodType<TInput>;
  impact: ToolImpact;
  approval: ToolApproval;
  requiredCapabilities: string[];
  enabled: boolean;
};

export type ToolAuthorizationContext = {
  appId: string;
  capabilities: string[];
  globalWritesEnabled: boolean;
  approval?: "user" | "admin";
};

export function assertToolExecutionAllowed<TInput>(
  tool: ToolDefinition<TInput>,
  input: unknown,
  context: ToolAuthorizationContext,
): TInput {
  if (!tool.enabled) throw new Error("TOOL_DISABLED");
  if (tool.appId !== context.appId) throw new Error("TOOL_APP_SCOPE_DENIED");

  for (const capability of tool.requiredCapabilities) {
    if (!context.capabilities.includes(capability)) throw new Error("TOOL_CAPABILITY_DENIED");
  }

  const parsed = tool.inputSchema.safeParse(input);
  if (!parsed.success) throw new Error("TOOL_INPUT_SCHEMA_INVALID");

  if ((tool.impact === "write" || tool.impact === "critical") && !context.globalWritesEnabled) {
    throw new Error("TOOL_WRITES_DISABLED");
  }

  if (tool.approval === "user" && context.approval !== "user" && context.approval !== "admin") {
    throw new Error("TOOL_USER_APPROVAL_REQUIRED");
  }
  if (tool.approval === "admin" && context.approval !== "admin") {
    throw new Error("TOOL_ADMIN_APPROVAL_REQUIRED");
  }

  if (tool.impact === "critical" && context.approval !== "admin") {
    throw new Error("TOOL_CRITICAL_REQUIRES_ADMIN_APPROVAL");
  }

  return parsed.data;
}

export const canonicalTools = {
  "finance.report.read": {
    id: "finance.report.read",
    appId: "nestfinance",
    inputSchema: z.object({ reportId: z.string().min(1) }),
    impact: "read",
    approval: "none",
    requiredCapabilities: ["finance:report:read"],
    enabled: true,
  },
  "connect.draft.create": {
    id: "connect.draft.create",
    appId: "connect",
    inputSchema: z.object({ conversationId: z.string().min(1), text: z.string().min(1).max(5000) }),
    impact: "draft",
    approval: "none",
    requiredCapabilities: ["connect:draft:create"],
    enabled: true,
  },
  "journey.followup.suggest": {
    id: "journey.followup.suggest",
    appId: "nestjourney",
    inputSchema: z.object({ personId: z.string().min(1), summary: z.string().min(1).max(4000) }),
    impact: "draft",
    approval: "none",
    requiredCapabilities: ["journey:followup:suggest"],
    enabled: true,
  },
  "calendar.availability.read": {
    id: "calendar.availability.read",
    appId: "nestlocal",
    inputSchema: z.object({ serviceId: z.string().min(1), date: z.string().min(1) }),
    impact: "read",
    approval: "none",
    requiredCapabilities: ["calendar:availability:read"],
    enabled: true,
  },
} satisfies Record<string, ToolDefinition>;
