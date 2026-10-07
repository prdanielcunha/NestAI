import { describe, expect, it } from "vitest";
import { routeModel } from "../../packages/router/src/index.js";

describe("deterministic router", () => {
  it("prefers the smaller Groq production model for eligible text", () => {
    expect(routeModel({
      sensitivity: "P1_INTERNAL",
      billingMode: "FREE_ONLY",
      modality: "text",
      allowedProviders: ["groq", "cloudflare"],
      blockedProviders: [],
    }).modelId).toBe("groq:gpt-oss-20b");
  });

  it("routes P3 away from Groq to the trusted Cloudflare boundary", () => {
    expect(routeModel({
      sensitivity: "P3_SENSITIVE",
      billingMode: "FREE_ONLY",
      modality: "text",
      allowedProviders: ["groq", "cloudflare"],
      blockedProviders: [],
    }).provider).toBe("cloudflare");
  });

  it("uses a vision-capable model when vision is required", () => {
    expect(routeModel({
      sensitivity: "P3_SENSITIVE",
      billingMode: "FREE_ONLY",
      modality: "vision",
      allowedProviders: ["cloudflare"],
      blockedProviders: [],
    }).modelId).toBe("cloudflare:gemma-4-26b-a4b-it");
  });

  it("refuses P4 instead of falling back", () => {
    expect(() => routeModel({
      sensitivity: "P4_RESTRICTED",
      billingMode: "FREE_ONLY",
      modality: "text",
      allowedProviders: ["groq", "cloudflare"],
      blockedProviders: [],
    })).toThrow("ROUTER_NO_ELIGIBLE_MODEL");
  });


  it("never routes candidate-only Qwen or NVIDIA into normal customer traffic", () => {
    const candidates = routeCandidates({
      sensitivity: "P1_INTERNAL",
      billingMode: "FREE_ONLY",
      modality: "text",
      allowedProviders: ["groq","cloudflare","nvidia-nim"],
      blockedProviders: [],
      availableProviders: ["groq","cloudflare","nvidia-nim"],
      allowPreviewModels: true,
      executionMode: "customer",
    });
    expect(candidates.some((item) => item.modelId === "groq:qwen3.8-27b")).toBe(false);
    expect(candidates.some((item) => item.provider === "nvidia-nim")).toBe(false);
  });

  it("allows candidate-only models exclusively in eval mode", () => {
    const candidates = routeCandidates({
      sensitivity: "P1_INTERNAL",
      billingMode: "FREE_ONLY",
      modality: "text",
      allowedProviders: ["groq","nvidia-nim"],
      blockedProviders: [],
      availableProviders: ["groq","nvidia-nim"],
      allowPreviewModels: true,
      executionMode: "eval",
    });
    expect(candidates.some((item) => item.modelId === "groq:qwen3.8-27b")).toBe(true);
    expect(candidates.some((item) => item.provider === "nvidia-nim")).toBe(true);
  });
});
