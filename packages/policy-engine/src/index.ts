import type { BillingMode, Sensitivity } from "../../contracts/src/index.js";

export type ProviderPolicy = { id:string; freeEligible:boolean; paidRequired:boolean; maxSensitivity:Sensitivity };
const rank:Sensitivity[]=["P0_PUBLIC","P1_INTERNAL","P2_PERSONAL","P3_SENSITIVE","P4_RESTRICTED"];

export function providerAllowed(args:{sensitivity:Sensitivity; provider:ProviderPolicy; billingMode:BillingMode}) {
  // P4 may only be processed by an explicitly local/on-device provider.
  if (args.sensitivity === "P4_RESTRICTED" && args.provider.id !== "local-webgpu") return false;
  if (args.billingMode === "FREE_ONLY" && (!args.provider.freeEligible || args.provider.paidRequired)) return false;
  return rank.indexOf(args.sensitivity) <= rank.indexOf(args.provider.maxSensitivity);
}

export function assertFreeOnlyInvariant(env:Record<string,string|undefined>) {
  if (env.AI_BILLING_MODE !== "FREE_ONLY") throw new Error("BOOT_REFUSED: AI_BILLING_MODE must start FREE_ONLY");
  if (env.ALLOW_PAID_FALLBACK !== "false") throw new Error("BOOT_REFUSED: paid fallback must be false");
  if (env.AUTO_UPGRADE_PROVIDER !== "false") throw new Error("BOOT_REFUSED: auto upgrade must be false");
  if (env.AI_PAID_ENABLED !== "false") throw new Error("BOOT_REFUSED: paid providers must be disabled");
}


export type PromptGuardPolicyInput = {
  verdict: "benign" | "malicious" | "uncertain";
  source: "user" | "retrieved";
  criticalAction: boolean;
};

export type PromptGuardPolicyAction = "ALLOW" | "QUARANTINE" | "REVIEW";

export function promptGuardPolicy(input: PromptGuardPolicyInput): PromptGuardPolicyAction {
  if (input.verdict === "benign") return "ALLOW";
  if (input.source === "retrieved") return "QUARANTINE";
  // Prompt Guard is evidence for the Policy Engine, not an authorization
  // authority. Potential false positives never trigger writes or tools.
  if (input.criticalAction) return "REVIEW";
  return "REVIEW";
}
