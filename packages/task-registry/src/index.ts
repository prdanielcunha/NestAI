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
  priority: "background" | "interactive" | "critical";
  cache: { mode: "disabled" | "tenant"; ttlSeconds: number };
};

export const tasks: TaskDefinition[] = [
  { id: "connect.reply.suggest", version: 1, app: "connect", modality: "text", defaultSensitivity: "P2_PERSONAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 768, timeoutMs: 12_000, priority: "interactive", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "finance.receipt.extract", version: 1, app: "nestfinance", modality: "vision", defaultSensitivity: "P3_SENSITIVE", allowedProviders: ["cloudflare"], blockedProviders: ["groq"], streaming: false, capability: "ai:run", maxOutputTokens: 1024, timeoutMs: 20_000, priority: "interactive", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "nestlume.study.answer", version: 1, app: "nestlume", modality: "text", defaultSensitivity: "P1_INTERNAL", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: true, capability: "ai:run", maxOutputTokens: 1536, timeoutMs: 20_000, priority: "interactive", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "affiliate.pin.copy", version: 1, app: "nestaffiliate", modality: "text", defaultSensitivity: "P0_PUBLIC", allowedProviders: ["groq", "cloudflare"], blockedProviders: [], streaming: false, capability: "ai:run", maxOutputTokens: 768, timeoutMs: 12_000, priority: "interactive", cache: { mode: "tenant", ttlSeconds: 1800 } },
  { id: "connect.audio.transcribe", version: 1, app: "connect", modality: "audio", defaultSensitivity: "P2_PERSONAL", allowedProviders: ["cloudflare", "groq"], blockedProviders: ["gemini", "mistral"], streaming: false, capability: "ai:run", maxOutputTokens: 4096, timeoutMs: 60_000, priority: "background", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "journey.form.extract", version: 1, app: "nestjourney", modality: "vision", defaultSensitivity: "P3_SENSITIVE", allowedProviders: ["cloudflare"], blockedProviders: ["groq", "gemini", "mistral"], streaming: false, capability: "ai:run", maxOutputTokens: 1536, timeoutMs: 45_000, priority: "background", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "nestlume.embedding.generate", version: 1, app: "nestlume", modality: "embedding", defaultSensitivity: "P1_INTERNAL", allowedProviders: ["cloudflare"], blockedProviders: ["groq", "gemini", "mistral"], streaming: false, capability: "ai:run", maxOutputTokens: 0, timeoutMs: 15_000, priority: "background", cache: { mode: "disabled", ttlSeconds: 0 } },
  { id: "affiliate.creative.generate", version: 1, app: "nestaffiliate", modality: "image", defaultSensitivity: "P0_PUBLIC", allowedProviders: ["cloudflare"], blockedProviders: ["groq", "gemini", "mistral"], streaming: false, capability: "ai:run", maxOutputTokens: 0, timeoutMs: 60_000, priority: "background", cache: { mode: "disabled", ttlSeconds: 0 } },
];

export function getTask(id: string): TaskDefinition {
  const task = tasks.find((item) => item.id === id);
  if (!task) throw new Error("TASK_NOT_REGISTERED");
  return task;
}
