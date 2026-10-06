import type { Sensitivity } from "../../contracts/src/index.js";

export type ProviderId = "groq" | "cloudflare" | "gemini" | "mistral";
export type ProviderStatus = "production" | "lab" | "blocked";
export type ProviderDataPolicy = "no_training_by_default" | "free_tier_may_improve_products" | "review_required";

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
  },
  gemini: {
    id: "gemini",
    status: "lab",
    freeEligible: true,
    maxSensitivity: "P1_INTERNAL",
    dataPolicy: "free_tier_may_improve_products",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-06",
    sourceUrls: [
      "https://ai.google.dev/gemini-api/docs/pricing",
      "https://ai.google.dev/gemini-api/terms",
    ],
    notes: [
      "Free Tier may be used to improve Google products; never route P2/P3/P4.",
      "Only tasks explicitly whitelisting Gemini may use it.",
    ],
  },
  mistral: {
    id: "mistral",
    status: "lab",
    freeEligible: false,
    maxSensitivity: "P1_INTERNAL",
    dataPolicy: "review_required",
    commercialUse: "review_required",
    attributionRequired: false,
    termsReviewedAt: "2026-10-06",
    sourceUrls: [
      "https://docs.mistral.ai/models",
    ],
    notes: [
      "Adapter exists for controlled laboratory/fallback evaluation.",
      "FREE_ONLY routing remains disabled until account-level free eligibility is re-verified.",
    ],
  },
} as const satisfies Record<ProviderId, ProviderDescriptor>;

export function getProvider(id: ProviderId): ProviderDescriptor {
  return providers[id];
}
