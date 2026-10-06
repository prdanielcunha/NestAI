import type { BillingMode, Sensitivity } from "../../contracts/src/index.js";
import { models, type ModelId } from "../../model-registry/src/index.js";
import { providerAllowed } from "../../policy-engine/src/index.js";

export type RouteRequest = {
  sensitivity: Sensitivity;
  billingMode: BillingMode;
  modality: "text" | "vision" | "audio" | "image" | "embedding";
  allowedProviders: string[];
  blockedProviders: string[];
  needsTools?: boolean;
  needsReasoning?: boolean;
};

export type RouteDecision = {
  modelId: ModelId;
  provider: "groq" | "cloudflare";
  providerModelId: string;
  reason: string[];
};

const providerMaxSensitivity: Record<"groq" | "cloudflare", Sensitivity> = {
  groq: "P2_PERSONAL",
  cloudflare: "P3_SENSITIVE",
};

const preference: ModelId[] = [
  "groq:gpt-oss-20b",
  "cloudflare:glm-4.7-flash",
  "groq:gpt-oss-120b",
  "cloudflare:nemotron-3-120b-a12b",
  "cloudflare:gemma-4-26b-a4b-it",
];

function supportsModality(model: (typeof models)[ModelId], modality: RouteRequest["modality"]): boolean {
  if (modality === "text") return !model.audioIn;
  if (modality === "vision") return model.vision === true;
  if (modality === "audio") return model.audioIn === true;
  return false;
}

export function routeModel(request: RouteRequest): RouteDecision {
  for (const modelId of preference) {
    const model = models[modelId];
    if (model.status !== "production") continue;
    if (!request.allowedProviders.includes(model.provider)) continue;
    if (request.blockedProviders.includes(model.provider)) continue;
    if (!supportsModality(model, request.modality)) continue;
    if (request.needsTools && model.tools !== true) continue;
    if (request.needsReasoning && model.reasoning !== true) continue;
    if (!providerAllowed({
      sensitivity: request.sensitivity,
      billingMode: request.billingMode,
      provider: {
        id: model.provider,
        freeEligible: model.freeEligible,
        paidRequired: model.paidRequired,
        maxSensitivity: providerMaxSensitivity[model.provider],
      },
    })) continue;

    return {
      modelId,
      provider: model.provider,
      providerModelId: model.providerModelId,
      reason: [
        "production_model",
        "provider_allowed_for_task",
        "privacy_policy_passed",
        request.billingMode === "FREE_ONLY" ? "free_only_passed" : "billing_policy_passed",
      ],
    };
  }

  throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
}
