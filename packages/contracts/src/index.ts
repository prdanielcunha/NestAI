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

const VisionFile = z.object({
  fileBase64: z.string().min(4).max(16_000_000),
  mimeType: z.enum([
    "image/jpeg","image/png","image/webp","image/gif","image/bmp",
    "application/pdf"
  ]),
  fileName: z.string().min(1).max(160),
  label: z.string().min(1).max(160).optional(),
});

export const VisionInput = z.union([
  VisionFile.extend({
    context: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    files: z.array(VisionFile).min(1).max(40),
    context: z.record(z.string(), z.unknown()).optional(),
  }),
]);
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


export const RagQueryRequest = z.object({
  task: z.string().min(1),
  query: z.string().min(1).max(20_000),
  topK: z.number().int().min(1).max(20).optional(),
  context: z.object({
    organizationId: z.string().min(1),
    locale: z.enum(["pt-BR","en","es"]).default("pt-BR"),
  }),
});
export type RagQueryRequest = z.infer<typeof RagQueryRequest>;

export const KnowledgeIngestRequest = z.object({
  sourceId: z.string().min(3).max(160).regex(/^[a-zA-Z0-9._:-]+$/),
  appId: z.string().min(2).max(64),
  organizationId: z.string().min(1).max(160),
  sensitivity: z.enum(["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE"]),
  locale: z.enum(["pt-BR","en","es"]).default("pt-BR"),
  title: z.string().min(1).max(240).optional(),
  locatorPrefix: z.string().min(1).max(500).optional(),
  text: z.string().min(1).max(500_000),
});
export type KnowledgeIngestRequest = z.infer<typeof KnowledgeIngestRequest>;
