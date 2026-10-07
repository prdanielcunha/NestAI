import type { Sensitivity } from "../../contracts/src/index.js";

export type ProviderId = "groq" | "cloudflare" | "gemini" | "mistral" | "nvidia-nim" | "local-webgpu";
export type ProviderStatus = "production" | "lab" | "blocked";
export type ProviderDataPolicy = "no_training_by_default" | "free_tier_may_improve_products" | "review_required" | "local_only";

export type ProviderDescriptor = {
  id: ProviderId;
  status: ProviderStatus;
  freeEligible: boolean;
  maxSensitivity: Sensitivity;
  dataPolicy: ProviderDataPolicy;
  commercialUse: "allowed" | "review_required";
  attributionRequired: boolean;
  termsReviewedAt: string;
  sourceUrls: string[];
  notes: string[];
  productionTrafficAllowed: boolean;
  customerTrafficAllowed: boolean;
  evalOnly: boolean;
  paidAllowed: boolean;
  sensitiveAllowed: boolean;
};

export const providers = {
  groq: {
    id: "groq",
    status: "production",
    freeEligible: true,
    maxSensitivity: "P2_PERSONAL",
    dataPolicy: "review_required",
    commercialUse: "allowed",
    attributionRequired: false,
    termsReviewedAt: "2026-10-06",
    sourceUrls: [
      "https://console.groq.com/docs/rate-limits",
      "https://console.groq.com/docs/models",
    ],
    notes: [
      "Free-plan limits are quota-bound and must be treated as changeable configuration.",
      "Production routing uses only models marked production in the Model Registry.",
    ],
    productionTrafficAllowed: true,
    customerTrafficAllowed: true,
    evalOnly: false,
    paidAllowed: false,
    sensitiveAllowed: true,
  },
  cloudflare: {
    id: "cloudflare",
    status: "production",
    freeEligible: true,
    maxSensitivity: "P3_SENSITIVE",
    dataPolicy: "no_training_by_default",
    commercialUse: "allowed",
    attributionRequired: false,
    termsReviewedAt: "2026-10-06",
    sourceUrls: [
      "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      "https://developers.cloudflare.com/workers-ai/platform/data-usage/",
    ],
    notes: [
      "Primary privacy-preserving free provider for P3-eligible tasks.",
      "Workers AI free quota must fail closed before paid usage can occur.",
    ],
    productionTrafficAllowed: true,
    customerTrafficAllowed: true,
    evalOnly: false,
    paidAllowed: false,
    sensitiveAllowed: true,
  },
  gemini: {
    id: "gemini",
    status: "lab",
    freeEligible: true,
    maxSensitivity: "P1_INTERNAL",
    dataPolicy: "free_tier_may_improve_products",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-07",
    sourceUrls: [
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai.google.dev/gemini-api/terms",
    ],
    notes: [
      "Free Tier may be used to improve Google products; never route P2/P3/P4.",
      "Stable Gemini 3.5 Flash-Lite is eligible only for explicitly whitelisted non-sensitive tasks.",
      "Provider is available at runtime only when GEMINI_API_KEY is configured as a Worker secret.",
    ],
    productionTrafficAllowed: true,
    customerTrafficAllowed: true,
    evalOnly: false,
    paidAllowed: false,
    sensitiveAllowed: false,
  },
  mistral: {
    id: "mistral",
    status: "lab",
    freeEligible: false,
    maxSensitivity: "P1_INTERNAL",
    dataPolicy: "review_required",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-07",
    sourceUrls: [
      "https://docs.mistral.ai/models",
      "https://docs.mistral.ai/getting-started/quickstarts/studio/activate-and-generate-api-key",
      "https://docs.mistral.ai/admin/billing-usage/subscriptions",
    ],
    notes: [
      "Mistral Free mode exists without a credit card and includes limited monthly API usage.",
      "An API key must still be created manually and is bound to the Organization/Workspace plan settings.",
      "FREE_ONLY routing stays disabled until Free mode is confirmed and pay-as-you-go is confirmed off for the production workspace.",
    ],
    productionTrafficAllowed: false,
    customerTrafficAllowed: false,
    evalOnly: true,
    paidAllowed: false,
    sensitiveAllowed: false,
  },
  "nvidia-nim": {
    id: "nvidia-nim",
    status: "lab",
    freeEligible: true,
    maxSensitivity: "P1_INTERNAL",
    dataPolicy: "review_required",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-07",
    sourceUrls: [
      "https://docs.api.nvidia.com/nim/reference/llm-apis",
      "https://build.nvidia.com/openai/gpt-oss-20b",
    ],
    notes: [
      "NVIDIA hosted NIM free endpoints are Evaluation Lab only.",
      "Never route normal customer traffic or P2/P3/P4 data to NVIDIA NIM.",
      "The NVIDIA_API_KEY is backend-only and may be absent without impacting production.",
    ],
    productionTrafficAllowed: false,
    customerTrafficAllowed: false,
    evalOnly: true,
    paidAllowed: false,
    sensitiveAllowed: false,
  },
  "local-webgpu": {
    id: "local-webgpu",
    status: "lab",
    freeEligible: true,
    maxSensitivity: "P4_RESTRICTED",
    dataPolicy: "local_only",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-07",
    sourceUrls: [
      "https://huggingface.co/docs/transformers.js",
    ],
    notes: [
      "Runs on-device with WebGPU when available and may fall back to WASM/CPU.",
      "Intended only for simple classification, language detection, normalization, embeddings and PII pre-detection.",
      "Essential product features must continue when local execution is unsupported or fails.",
    ],
    productionTrafficAllowed: true,
    customerTrafficAllowed: true,
    evalOnly: false,
    paidAllowed: false,
    sensitiveAllowed: true,
  },
} as const satisfies Record<ProviderId, ProviderDescriptor>;

export function getProvider(id: ProviderId): ProviderDescriptor {
  return providers[id];
}
