import type { Sensitivity } from "../../contracts/src/index.js";

export type TaskDefinition = {
  id: string;
  app: string;
  modality: "text" | "vision" | "audio" | "image" | "embedding";
  defaultSensitivity: Sensitivity;
  allowedProviders: string[];
  blockedProviders: string[];
  streaming: boolean;
  capability: string;
  maxOutputTokens: number;
};

export const tasks: TaskDefinition[] = [
  { id: "connect.reply.suggest", app: "connect", modality: "text", defaultSensitivity: "P2_PERSONAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 768 },
  { id: "finance.receipt.extract", app: "nestfinance", modality: "vision", defaultSensitivity: "P3_SENSITIVE", allowedProviders: ["cloudflare"], blockedProviders: ["groq"], streaming: false, capability: "ai:run", maxOutputTokens: 1024 },
  { id: "nestlume.study.answer", app: "nestlume", modality: "text", defaultSensitivity: "P1_INTERNAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 1536 },
  { id: "affiliate.pin.copy", app: "nestaffiliate", modality: "text", defaultSensitivity: "P0_PUBLIC", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: false, capability: "ai:run", maxOutputTokens: 768 },
];

export function getTask(id: string): TaskDefinition {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("TASK_NOT_REGISTERED");
  return task;
}
