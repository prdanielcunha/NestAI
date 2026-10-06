import { z } from "zod";

export const Sensitivity = z.enum(["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"]);
export type Sensitivity = z.infer<typeof Sensitivity>;

export const BillingMode = z.enum(["FREE_ONLY","HYBRID_BUDGETED","PREMIUM_ROUTING"]);
export type BillingMode = z.infer<typeof BillingMode>;

export const TaskRequest = z.object({
  task: z.string().min(3),
  input: z.unknown(),
  context: z.object({ organizationId: z.string().min(1).optional(), locale: z.enum(["pt-BR","en","es"]).optional() }).default({})
});
export type TaskRequest = z.infer<typeof TaskRequest>;


export const AudioInput = z.object({
  audioBase64: z.string().min(4).max(16_000_000),
  mimeType: z.enum(["audio/webm","audio/wav","audio/mpeg","audio/mp4","audio/ogg"]),
  fileName: z.string().min(1).max(160).optional(),
  language: z.string().min(2).max(10).optional(),
});
export type AudioInput = z.infer<typeof AudioInput>;

export const VisionInput = z.object({
  fileBase64: z.string().min(4).max(16_000_000),
  mimeType: z.enum([
    "image/jpeg","image/png","image/webp","image/gif","image/bmp",
    "application/pdf"
  ]),
  fileName: z.string().min(1).max(160),
});
export type VisionInput = z.infer<typeof VisionInput>;

export const EmbeddingInput = z.object({
  texts: z.union([
    z.string().min(1).max(20_000),
    z.array(z.string().min(1).max(20_000)).min(1).max(32),
  ]),
});
export type EmbeddingInput = z.infer<typeof EmbeddingInput>;

export const ImageInput = z.object({
  prompt: z.string().min(1).max(2048),
  steps: z.number().int().min(1).max(8).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
});
export type ImageInput = z.infer<typeof ImageInput>;
