import type { BillingMode, Sensitivity } from "../../contracts/src/index.js";
import { models, type ModelDescriptor, type ModelId } from "../../model-registry/src/index.js";
import { providerAllowed } from "../../policy-engine/src/index.js";
import { getProvider, type ProviderId } from "../../provider-registry/src/index.js";

export type RouteRequest = {
  sensitivity: Sensitivity;
  billingMode: BillingMode;
  modality: "text" | "vision" | "audio" | "image" | "embedding";
  allowedProviders: string[];
  blockedProviders: string[];
  availableProviders?: string[];
  needsTools?: boolean;
  needsReasoning?: boolean;
  needsStructuredOutput?: boolean;
  allowPreviewModels?: boolean;
};

export type RouteDecision = {
  modelId: ModelId;
  provider: ProviderId;
  providerModelId: string;
  reason: string[];
};

const preference: ModelId[] = [
  "cloudflare:embeddinggemma-300m",
  "cloudflare:whisper-large-v3-turbo",
  "groq:whisper-large-v3-turbo",
  "cloudflare:flux-1-schnell",
  "groq:gpt-oss-20b",
  "cloudflare:glm-4.7-flash",
  "groq:gpt-oss-120b",
  "cloudflare:nemotron-3-120b-a12b",
  "cloudflare:gemma-4-26b-a4b-it",
];

function supportsModality(model: ModelDescriptor, modality: RouteRequest["modality"]): boolean {
  if (modality === "text") return model.audioIn !== true && model.embedding !== true && model.imageOut !== true;
  if (modality === "vision") return model.vision === true;
  if (modality === "audio") return model.audioIn === true;
  if (modality === "embedding") return model.embedding === true;
  if (modality === "image") return model.imageOut === true;
  return false;
}

export function routeCandidates(request: RouteRequest): RouteDecision[] {
  const decisions: RouteDecision[] = [];
  for (const modelId of preference) {
    const model: ModelDescriptor = models[modelId];
    if (model.status !== "production" && !(request.allowPreviewModels && model.status === "preview")) continue;
    if (!request.allowedProviders.includes(model.provider)) continue;
    if (request.availableProviders && !request.availableProviders.includes(model.provider)) continue;
    if (request.blockedProviders.includes(model.provider)) continue;
    if (!supportsModality(model, request.modality)) continue;
    if (request.needsTools && model.tools !== true) continue;
    if (request.needsReasoning && model.reasoning !== true) continue;
    if (request.needsStructuredOutput && model.structuredOutput !== true) continue;
    const provider = getProvider(model.provider);
    if (provider.status === "blocked") continue;
    if (!providerAllowed({
      sensitivity: request.sensitivity,
      billingMode: request.billingMode,
      provider: {
        id: model.provider,
        freeEligible: provider.freeEligible && model.freeEligible,
        paidRequired: model.paidRequired,
        maxSensitivity: provider.maxSensitivity,
      },
    })) continue;

    decisions.push({
      modelId,
      provider: model.provider,
      providerModelId: model.providerModelId,
      reason: [
        model.status === "production" ? "production_model" : "preview_model_explicitly_allowed",
        "provider_allowed_for_task",
        "privacy_policy_passed",
        request.billingMode === "FREE_ONLY" ? "free_only_passed" : "billing_policy_passed",
      ],
    });
  }

  return decisions;
}

export function routeModel(request: RouteRequest): RouteDecision {
  const [decision] = routeCandidates(request);
  if (!decision) throw new Error("ROUTER_NO_ELIGIBLE_MODEL");
  return decision;
}
