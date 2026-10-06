export type ToolRisk = "read" | "reversible_write" | "irreversible_write";
export type ToolDefinition = {
  id: string;
  requiredCapability: string;
  risk: ToolRisk;
  enabled: boolean;
};

export function assertToolExecutionAllowed(tool: ToolDefinition, capabilities: string[], globalWritesEnabled: boolean): void {
  if (!tool.enabled) throw new Error("TOOL_DISABLED");
  if (!capabilities.includes(tool.requiredCapability)) throw new Error("TOOL_CAPABILITY_DENIED");
  if (tool.risk !== "read" && !globalWritesEnabled) throw new Error("TOOL_WRITES_DISABLED");
  if (tool.risk === "irreversible_write") throw new Error("TOOL_IRREVERSIBLE_REQUIRES_DOMAIN_CONFIRMATION");
}
