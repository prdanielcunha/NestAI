export type ModelStatus = "production" | "preview" | "blocked";

export type ModelDescriptor = {
  provider: "groq" | "cloudflare";
  providerModelId: string;
  status: ModelStatus;
  freeEligible: boolean;
  paidRequired: boolean;
  context?: number;
  structuredOutput?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  vision?: boolean;
  audioIn?: boolean;
  reviewedAt: string;
};

export const models = {
  "groq:gpt-oss-120b": {
    provider: "groq",
    providerModelId: "openai/gpt-oss-120b",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    context: 131072,
    structuredOutput: true,
    tools: true,
    reasoning: true,
    reviewedAt: "2026-10-06",
  },
  "groq:gpt-oss-20b": {
    provider: "groq",
    providerModelId: "openai/gpt-oss-20b",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    context: 131072,
    structuredOutput: true,
    tools: true,
    reasoning: true,
    reviewedAt: "2026-10-06",
  },
  "groq:whisper-large-v3-turbo": {
    provider: "groq",
    providerModelId: "whisper-large-v3-turbo",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    audioIn: true,
    reviewedAt: "2026-10-06",
  },
  "cloudflare:glm-4.7-flash": {
    provider: "cloudflare",
    providerModelId: "@cf/zai-org/glm-4.7-flash",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    context: 131072,
    structuredOutput: true,
    tools: true,
    reasoning: true,
    reviewedAt: "2026-10-06",
  },
  "cloudflare:gemma-4-26b-a4b-it": {
    provider: "cloudflare",
    providerModelId: "@cf/google/gemma-4-26b-a4b-it",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    context: 256000,
    tools: true,
    reasoning: true,
    vision: true,
    reviewedAt: "2026-10-06",
  },
  "cloudflare:nemotron-3-120b-a12b": {
    provider: "cloudflare",
    providerModelId: "@cf/nvidia/nemotron-3-120b-a12b",
    status: "production",
    freeEligible: true,
    paidRequired: false,
    context: 32000,
    tools: true,
    reasoning: true,
    reviewedAt: "2026-10-06",
  },
  "cloudflare:kimi-k2.7-code": {
    provider: "cloudflare",
    providerModelId: "@cf/moonshotai/kimi-k2.7-code",
    status: "blocked",
    freeEligible: false,
    paidRequired: true,
    reviewedAt: "2026-10-06",
  },
} as const satisfies Record<string, ModelDescriptor>;

export type ModelId = keyof typeof models;
