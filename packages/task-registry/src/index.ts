import type { Sensitivity } from "../../contracts/src/index.js";

export type TaskDefinition = {
  id: string;
  version: number;
  app: string;
  modality: "text" | "vision" | "audio" | "image" | "embedding";
  defaultSensitivity: Sensitivity;
  allowedProviders: string[];
  blockedProviders: string[];
  streaming: boolean;
  capability: string;
  maxOutputTokens: number;
  timeoutMs: number;
};

export const tasks: TaskDefinition[] = [
  { id: "connect.reply.suggest", version: 1, app: "connect", modality: "text", defaultSensitivity: "P2_PERSONAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 768, timeoutMs: 12_000 },
  { id: "finance.receipt.extract", version: 1, app: "nestfinance", modality: "vision", defaultSensitivity: "P3_SENSITIVE", allowedProviders: ["cloudflare"], blockedProviders: ["groq"], streaming: false, capability: "ai:run", maxOutputTokens: 1024, timeoutMs: 20_000 },
  { id: "nestlume.study.answer", version: 1, app: "nestlume", modality: "text", defaultSensitivity: "P1_INTERNAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 1536, timeoutMs: 20_000 },
  { id: "affiliate.pin.copy", version: 1, app: "nestaffiliate", modality: "text", defaultSensitivity: "P0_PUBLIC", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: false, capability: "ai:run", maxOutputTokens: 768, timeoutMs: 12_000 },
];

export function getTask(id: string): TaskDefinition {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("TASK_NOT_REGISTERED");
  return task;
}
