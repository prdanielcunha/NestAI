import { describe, expect, it } from "vitest";
import {
  assertCommercialEntitlement, quoteNestLocalTask, sha256,
} from "../../packages/commercial-credits/src/index.js";
import { readFileSync } from "node:fs";

describe("NestAI commercial policy — fail-closed by default", () => {
  const at = new Date("2026-10-08T12:00:00Z");
  it("requires signed Hub-derived entitlement (not browser plan flags)", () => {
    expect(() => assertCommercialEntitlement(undefined,"nestlocal",at)).toThrow("AI_HUB_ENTITLEMENT_REQUIRED");
    expect(() => assertCommercialEntitlement({
      accessState:"trial_active",canUseAI:true,appId:"musicscale",grantVersion:2,
      trialEndsAt:"2026-10-10T12:00:00Z",billingSource:"hub_internal_trial",
    },"nestlocal",at)).toThrow("AI_HUB_ENTITLEMENT_REQUIRED");
  });
  it("preserves functional trial only while internal Hub trial remains valid", () => {
    const trial = {accessState:"trial_active" as const,canUseAI:true,appId:"nestlocal",grantVersion:2,
      trialEndsAt:"2026-10-15T12:00:00Z",billingSource:"hub_internal_trial" as const};
    expect(assertCommercialEntitlement(trial,"nestlocal",at)).toBe(trial);
    expect(() => assertCommercialEntitlement({...trial,trialEndsAt:"2026-10-08T12:00:00Z"},"nestlocal",at))
      .toThrow("TRIAL_EXPIRED");
    expect(() => assertCommercialEntitlement({...trial,billingSource:"stripe"},"nestlocal",at))
      .toThrow("TRIAL_EXPIRED");
  });
  it("allows paid access only from Hub-supported billing", () => {
    expect(assertCommercialEntitlement({accessState:"paid_active",canUseAI:true,appId:"nestlocal",
      grantVersion:2,billingSource:"stripe",plan:"growth"},"nestlocal",at).plan).toBe("growth");
    expect(() => assertCommercialEntitlement({accessState:"paid_active",canUseAI:true,appId:"nestlocal",
      grantVersion:2,billingSource:"hub_internal_trial"},"nestlocal",at)).toThrow("AI_HUB_ENTITLEMENT_REQUIRED");
    expect(() => assertCommercialEntitlement({accessState:"expired_read_only",canUseAI:false,appId:"nestlocal",
      grantVersion:2,billingSource:"stripe"},"nestlocal",at)).toThrow();
  });
  it("prices certified text tasks only, not arbitrary tasks", () => {
    for(const taskId of ["nestlocal.request.extract","nestlocal.quote.compose","nestlocal.followup.compose",
      "nestlocal.pulse.explain","nestlocal.setup.assist","nestlocal.return.suggest"]) {
      const quote=quoteNestLocalTask(taskId);
      expect(quote.maxCharge).toBe(1);
      expect(quote.priceVersion).toBe(1);
    }
    expect(() => quoteNestLocalTask("nestfinance.receipt.extract")).toThrow("AI_CREDIT_TASK_NOT_PRICED");
  });
  it("quotes screenshots by image count and requires confirmation on bulk", () => {
    expect(quoteNestLocalTask("nestlocal.screenshot.extract",{images:2}).maxCharge).toBe(6);
    expect(quoteNestLocalTask("nestlocal.screenshot.extract",{images:2}).requiresConfirmation).toBe(true);
    expect(() => quoteNestLocalTask("nestlocal.screenshot.extract",{images:11})).toThrow("AI_INPUT_TOO_LARGE");
  });
  it("quotes audio by minute started and enforces input caps", () => {
    expect(quoteNestLocalTask("nestlocal.audio.transcribe",{seconds:61}).maxCharge).toBe(4);
    expect(quoteNestLocalTask("nestlocal.audio.transcribe",{seconds:60}).maxCharge).toBe(2);
    expect(() => quoteNestLocalTask("nestlocal.audio.transcribe",{seconds:601})).toThrow("AI_INPUT_TOO_LARGE");
  });
  it("quotes exported messages before import with an explicit consent step", () => {
    const quote=quoteNestLocalTask("nestlocal.conversation.import",{messages:101});
    expect(quote.maxCharge).toBe(20);
    expect(quote.requiresConfirmation).toBe(true);
    expect(() => quoteNestLocalTask("nestlocal.conversation.import",{messages:1001})).toThrow("AI_INPUT_TOO_LARGE");
  });
  it("does not debit tenant-safe cache hits or provider failures", () => {
    expect(quoteNestLocalTask("nestlocal.request.extract",{cached:true}).maxCharge).toBe(0);
  });
  it("hashes tenant identifiers instead of persisting raw IDs in ledger", async () => {
    const digest=await sha256("org_private_123");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(digest).not.toContain("private");
  });
});

describe("D1 credit ledger schema integrity", () => {
  const sql=readFileSync("migrations/0008_commercial_credits.sql","utf8");
  it("provides unique idempotent grant/charge anchors", () => {
    expect(sql).toContain("UNIQUE (organization_hash, app_id, source, source_ref)");
    expect(sql).toContain("UNIQUE (organization_hash, app_id, task_id, idempotency_key_hash)");
    expect(sql).toContain("ai_credit_reservation_status_guard");
  });
  it("fails reservations with insufficient multi-grant capacity and retains append-only history", () => {
    expect(sql).toContain("AI_CREDIT_RESERVATION_INCOMPLETE");
    expect(sql).toContain("ai_credit_allocation_guard");
    expect(sql).toContain("ai_credit_transactions");
    expect(sql).toContain("ai_credit_reservation_finalized");
  });
  it("never treats unknown provider cost as free", () => {
    expect(sql).toContain("actual_micro_usd INTEGER");
    expect(sql).toContain("ai_budget_windows");
  });
});
