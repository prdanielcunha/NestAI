import { describe, expect, it } from "vitest";
import { providers } from "../../packages/provider-registry/src/index.js";
import { providerAllowed } from "../../packages/policy-engine/src/index.js";

describe("provider privacy and free-tier policy", () => {
  it("blocks Gemini Free for personal and sensitive data", () => {
    const gemini = providers.gemini;
    for (const sensitivity of ["P2_PERSONAL", "P3_SENSITIVE"] as const) {
      expect(providerAllowed({
        sensitivity,
        billingMode: "FREE_ONLY",
        provider: {
          id: gemini.id,
          freeEligible: gemini.freeEligible,
          paidRequired: false,
          maxSensitivity: gemini.maxSensitivity,
        },
      })).toBe(false);
    }
  });

  it("blocks Mistral in FREE_ONLY until free eligibility is explicitly reviewed", () => {
    const mistral = providers.mistral;
    expect(providerAllowed({
      sensitivity: "P0_PUBLIC",
      billingMode: "FREE_ONLY",
      provider: {
        id: mistral.id,
        freeEligible: mistral.freeEligible,
        paidRequired: true,
        maxSensitivity: mistral.maxSensitivity,
      },
    })).toBe(false);
  });

  it("never allows P4 on an external provider and allows it only on the local boundary", () => {
    for (const provider of Object.values(providers)) {
      const allowed = providerAllowed({
        sensitivity: "P4_RESTRICTED",
        billingMode: "FREE_ONLY",
        provider: {
          id: provider.id,
          freeEligible: provider.freeEligible,
          paidRequired: !provider.freeEligible,
          maxSensitivity: provider.maxSensitivity,
        },
      });
      expect(allowed).toBe(provider.id === "local-webgpu");
    }
  });
});
