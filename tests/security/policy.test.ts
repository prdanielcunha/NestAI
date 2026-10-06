import {describe,it,expect} from "vitest";
import {assertFreeOnlyInvariant,providerAllowed} from "../../packages/policy-engine/src/index.js";
describe("privacy and cost invariants",()=>{
 it("never sends P4 externally",()=>expect(providerAllowed({sensitivity:"P4_RESTRICTED",billingMode:"FREE_ONLY",provider:{id:"groq",freeEligible:true,paidRequired:false,maxSensitivity:"P3_SENSITIVE"}})).toBe(false));
 it("blocks paid provider in FREE_ONLY",()=>expect(providerAllowed({sensitivity:"P0_PUBLIC",billingMode:"FREE_ONLY",provider:{id:"paid",freeEligible:false,paidRequired:true,maxSensitivity:"P3_SENSITIVE"}})).toBe(false));
 it("refuses unsafe boot flags",()=>expect(()=>assertFreeOnlyInvariant({AI_BILLING_MODE:"FREE_ONLY",ALLOW_PAID_FALLBACK:"true",AUTO_UPGRADE_PROVIDER:"false",AI_PAID_ENABLED:"false"})).toThrow());
});
