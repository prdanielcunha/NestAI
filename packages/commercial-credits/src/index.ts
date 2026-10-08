import type { D1DatabaseLike, D1Statement } from "../../usage-ledger/src/index.js";

export type CreditSource = "trial" | "plan" | "addon" | "legacy";
export type CommercialPlan = "essential" | "growth" | "pro";
export type CommercialAccessState = "trial_active" | "paid_active" | "expired_read_only";

export type HubAiEntitlement = {
  accessState: CommercialAccessState;
  canUseAI: boolean;
  appId: string;
  grantVersion: number;
  trialEndsAt?: string;
  activeUntil?: string;
  plan?: CommercialPlan;
  billingSource: "hub_internal_trial" | "stripe" | "legacy";
};
export type CreditQuote = {
  taskId: string;
  priceVersion: number;
  creditsEstimate: number;
  maxCharge: number;
  requiresConfirmation: boolean;
  description: string;
};
export type CreditReservation = {
  reservationId: string;
  state: "pending" | "reserved" | "settled" | "released";
  maxCharge: number;
  actualCharge: number;
  replayed: boolean;
};
export type CommercialDatabase = D1DatabaseLike & {
  batch(statements: D1Statement[]): Promise<unknown[]>;
};

type CreditContext = {
  organizationId: string;
  appId: string;
};
type ReservationContext = CreditContext & {
  taskId: string;
  idempotencyKey: string;
  requestHash: string;
};

const PRICES_VERSION = 1;
const TEXT_TASKS = new Set([
  "nestlocal.request.extract", "nestlocal.quote.compose",
  "nestlocal.followup.compose", "nestlocal.pulse.explain",
  "nestlocal.setup.assist", "nestlocal.return.suggest",
]);

function checkId(value: string, field: string): string {
  if (typeof value !== "string" || value.length < 2 || value.length > 200) throw new Error("AI_CREDIT_INVALID_" + field);
  return value;
}

function checkAmount(value: number, name: string, allowZero = false): number {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error("AI_CREDIT_INVALID_" + name);
  return value;
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function requireDates(beginsAt: string, expiresAt: string): void {
  const begins = Date.parse(beginsAt), expires = Date.parse(expiresAt);
  if (!Number.isFinite(begins) || !Number.isFinite(expires) || expires <= begins) {
    throw new Error("AI_CREDIT_INVALID_GRANT_DATES");
  }
}

export function assertCommercialEntitlement(
  entitlement: HubAiEntitlement | undefined,
  appId: string,
  at = new Date(),
): HubAiEntitlement {
  if (!entitlement || entitlement.appId !== appId || entitlement.canUseAI !== true ||
      !Number.isSafeInteger(entitlement.grantVersion) || entitlement.grantVersion < 1) {
    throw new Error("AI_HUB_ENTITLEMENT_REQUIRED");
  }
  if (entitlement.accessState !== "trial_active" && entitlement.accessState !== "paid_active") {
    throw new Error("TRIAL_EXPIRED");
  }
  if (entitlement.accessState === "trial_active") {
    if (entitlement.billingSource !== "hub_internal_trial" ||
        !entitlement.trialEndsAt || !(Date.parse(entitlement.trialEndsAt) > at.getTime())) {
      throw new Error("TRIAL_EXPIRED");
    }
  } else if (entitlement.billingSource !== "stripe" && entitlement.billingSource !== "legacy") {
    throw new Error("AI_HUB_ENTITLEMENT_REQUIRED");
  }
  if (entitlement.activeUntil && !(Date.parse(entitlement.activeUntil) > at.getTime())) {
    throw new Error("AI_HUB_ENTITLEMENT_EXPIRED");
  }
  return entitlement;
}

/** Prices are provisional until real COGS evidence approves publication. Unknown tasks fail closed. */
export function quoteNestLocalTask(taskId: string, options: {
  seconds?: number;
  images?: number;
  messages?: number;
  cached?: boolean;
} = {}): CreditQuote {
  if (options.cached === true) {
    return { taskId, priceVersion: PRICES_VERSION, creditsEstimate: 0, maxCharge: 0,
      requiresConfirmation: false, description: "Tenant-safe cached result; no model call" };
  }
  let credits: number, description: string, confirm = false;
  if (TEXT_TASKS.has(taskId)) {
    credits = 1;
    description = "Resposta contextual curta";
  } else if (taskId === "nestlocal.screenshot.extract") {
    const images = checkAmount(options.images ?? 1, "IMAGES");
    if (images > 10) throw new Error("AI_INPUT_TOO_LARGE");
    credits = images * 3; confirm = images > 1;
    description = "OCR e sugestão por imagem";
  } else if (taskId === "nestlocal.audio.transcribe") {
    const seconds = checkAmount(options.seconds ?? -1, "AUDIO_SECONDS");
    if (seconds > 600) throw new Error("AI_INPUT_TOO_LARGE");
    credits = Math.ceil(seconds / 60) * 2; confirm = seconds > 60;
    description = "Transcrição e extração de áudio por minuto iniciado";
  } else if (taskId === "nestlocal.conversation.import") {
    const messages = checkAmount(options.messages ?? -1, "MESSAGES");
    if (messages > 1000) throw new Error("AI_INPUT_TOO_LARGE");
    credits = Math.ceil(messages / 100) * 10; confirm = true;
    description = "Importação de conversa por lote de até 100 mensagens";
  } else {
    throw new Error("AI_CREDIT_TASK_NOT_PRICED");
  }
  return { taskId, priceVersion: PRICES_VERSION, creditsEstimate: credits,
    maxCharge: credits, requiresConfirmation: confirm, description };
}

export async function grantCredits(
  db: CommercialDatabase,
  args: CreditContext & {
    source: CreditSource; sourceRef: string; grantVersion: number;
    amount: number; beginsAt: string; expiresAt: string;
  },
): Promise<{ grantId: string; created: boolean }> {
  checkId(args.organizationId, "ORG");
  checkId(args.appId, "APP");
  checkId(args.sourceRef, "SOURCE_REF");
  checkAmount(args.amount, "GRANT");
  checkAmount(args.grantVersion, "VERSION");
  requireDates(args.beginsAt, args.expiresAt);
  const organizationHash = await sha256(args.organizationId);
  const grantId = await sha256([organizationHash,args.appId,args.source,args.sourceRef].join(":"));
  const now = new Date().toISOString();
  const inserted = await db.prepare(
    "INSERT INTO ai_credit_grants(grant_id,organization_hash,app_id,source,source_ref,grant_version,total_credits,begins_at,expires_at,created_at) " +
    "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10) ON CONFLICT(organization_hash,app_id,source,source_ref) DO NOTHING"
  ).bind(grantId,organizationHash,args.appId,args.source,args.sourceRef,args.grantVersion,
    args.amount,args.beginsAt,args.expiresAt,now).run();
  const row = await db.prepare(
    "SELECT grant_id,grant_version,total_credits,begins_at,expires_at FROM ai_credit_grants WHERE grant_id=?1"
  ).bind(grantId).first<{ grant_id: string; grant_version: number; total_credits: number; begins_at: string; expires_at: string }>();
  if (!row || row.grant_version !== args.grantVersion || row.total_credits !== args.amount ||
      row.begins_at !== args.beginsAt || row.expires_at !== args.expiresAt) {
    throw new Error("AI_CREDIT_GRANT_CONFLICT");
  }
  return { grantId, created: (inserted.meta?.changes ?? 0) > 0 };
}

export async function getCreditBalance(db: CommercialDatabase, args: CreditContext, at = new Date()) {
  const org = await sha256(checkId(args.organizationId,"ORG"));
  const appId = checkId(args.appId,"APP");
  const row = await db.prepare(
    "SELECT COALESCE(SUM(total_credits-consumed_credits-reserved_credits),0) AS available, " +
    "COALESCE(SUM(reserved_credits),0) AS reserved, COALESCE(SUM(consumed_credits),0) AS consumed " +
    "FROM ai_credit_grants WHERE organization_hash=?1 AND app_id=?2 AND begins_at<=?3 AND expires_at>?3"
  ).bind(org, appId, at.toISOString()).first<{available:number;reserved:number;consumed:number}>();
  return {
    appId,
    available: Number(row?.available ?? 0),
    reserved: Number(row?.reserved ?? 0),
    consumed: Number(row?.consumed ?? 0),
    asOf: at.toISOString(),
  };
}

async function existingReservation(
  db: CommercialDatabase, orgHash: string, args: ReservationContext, keyHash: string,
): Promise<CreditReservation | null> {
  const row = await db.prepare(
    "SELECT reservation_id,state,max_charge,actual_charge,request_hash FROM ai_credit_reservations " +
    "WHERE organization_hash=?1 AND app_id=?2 AND task_id=?3 AND idempotency_key_hash=?4"
  ).bind(orgHash,args.appId,args.taskId,keyHash)
    .first<{reservation_id:string;state:CreditReservation["state"];max_charge:number;actual_charge:number;request_hash:string}>();
  if (!row) return null;
  if (row.request_hash !== args.requestHash) throw new Error("AI_CREDIT_IDEMPOTENCY_CONFLICT");
  return { reservationId:row.reservation_id,state:row.state,maxCharge:row.max_charge,
    actualCharge:row.actual_charge,replayed:true };
}

/** A single D1 batch allocates across several expiring grants, or commits nothing. */
export async function reserveCredits(
  db: CommercialDatabase,
  args: ReservationContext & { maxCharge: number; priceVersion: number },
  at = new Date(),
): Promise<CreditReservation> {
  checkAmount(args.maxCharge,"RESERVATION");
  checkAmount(args.priceVersion,"PRICE_VERSION");
  checkId(args.organizationId,"ORG"); checkId(args.appId,"APP");
  checkId(args.taskId,"TASK"); checkId(args.idempotencyKey,"IDEMPOTENCY_KEY");
  checkId(args.requestHash,"REQUEST_HASH");
  const orgHash = await sha256(args.organizationId);
  const keyHash = await sha256(args.idempotencyKey);
  const previous = await existingReservation(db,orgHash,args,keyHash);
  if (previous) {
    if (previous.maxCharge !== args.maxCharge) throw new Error("AI_CREDIT_IDEMPOTENCY_CONFLICT");
    return previous;
  }
  const reservationId = crypto.randomUUID();
  const now = at.toISOString();
  const expires = new Date(at.getTime() + 20 * 60_000).toISOString();
  const create = db.prepare(
    "INSERT INTO ai_credit_reservations(reservation_id,organization_hash,app_id,task_id,idempotency_key_hash,request_hash,price_version,max_charge,state,created_at,expires_at) " +
    "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,'pending',?9,?10)"
  ).bind(reservationId,orgHash,args.appId,args.taskId,keyHash,args.requestHash,args.priceVersion,args.maxCharge,now,expires);
  const allocate = db.prepare(
    "WITH eligible AS (" +
    " SELECT grant_id,total_credits-consumed_credits-reserved_credits AS available, " +
    " SUM(total_credits-consumed_credits-reserved_credits) OVER (" +
    " ORDER BY expires_at,grant_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior " +
    " FROM ai_credit_grants WHERE organization_hash=?1 AND app_id=?2 AND begins_at<=?3 " +
    " AND expires_at>?3 AND total_credits-consumed_credits-reserved_credits>0" +
    "), eligible_total AS (SELECT COALESCE(SUM(available),0) AS total FROM eligible) " +
    "INSERT INTO ai_credit_allocations(reservation_id,grant_id,reserved_credits,consumed_credits) " +
    "SELECT ?4,grant_id,MIN(available,MAX(0,?5-COALESCE(prior,0))),0 FROM eligible " +
    "WHERE (SELECT total FROM eligible_total)>=?5 AND COALESCE(prior,0)<?5"
  ).bind(orgHash,args.appId,now,reservationId,args.maxCharge);
  const finalize = db.prepare(
    "UPDATE ai_credit_reservations SET state='reserved' WHERE reservation_id=?1 AND state='pending'"
  ).bind(reservationId);
  try {
    await db.batch([create,allocate,finalize]);
  } catch (error) {
    const current = await existingReservation(db,orgHash,args,keyHash);
    if (current) return current;
    const message = error instanceof Error ? error.message : "";
    if (message.includes("AI_CREDIT_RESERVATION_INCOMPLETE") ||
        message.includes("AI_CREDIT_GRANT_NOT_AVAILABLE")) throw new Error("AI_MONTHLY_CREDITS_EXHAUSTED");
    throw error;
  }
  return {reservationId,state:"reserved",maxCharge:args.maxCharge,actualCharge:0,replayed:false};
}

/** Failed/invalid provider outputs call release; valid results call settle exactly once. */
export async function finalizeCredits(
  db: CommercialDatabase,
  args: CreditContext & { reservationId: string; actualCharge: number; success: boolean },
  at = new Date(),
): Promise<CreditReservation> {
  checkId(args.reservationId,"RESERVATION_ID");
  checkAmount(args.actualCharge,"ACTUAL_CHARGE",true);
  const orgHash = await sha256(checkId(args.organizationId,"ORG"));
  const row = await db.prepare(
    "SELECT state,max_charge,actual_charge FROM ai_credit_reservations " +
    "WHERE reservation_id=?1 AND organization_hash=?2 AND app_id=?3"
  ).bind(args.reservationId,orgHash,args.appId).first<{state:CreditReservation["state"];max_charge:number;actual_charge:number}>();
  if (!row) throw new Error("AI_CREDIT_RESERVATION_NOT_FOUND");
  if (row.state === "settled" || row.state === "released") {
    if (row.state !== (args.success ? "settled" : "released") ||
        row.actual_charge !== (args.success ? args.actualCharge : 0)) throw new Error("AI_CREDIT_FINALIZATION_CONFLICT");
    return {reservationId:args.reservationId,state:row.state,maxCharge:row.max_charge,actualCharge:row.actual_charge,replayed:true};
  }
  if (row.state !== "reserved") throw new Error("AI_CREDIT_RESERVATION_NOT_READY");
  if (args.success && args.actualCharge > row.max_charge) throw new Error("AI_CREDIT_CHARGE_EXCEEDS_QUOTE");
  const charge = args.success ? args.actualCharge : 0;
  const rankedUpdate = db.prepare(
    "WITH ranked AS (SELECT a.rowid AS rid, a.reserved_credits, " +
    "COALESCE(SUM(a.reserved_credits) OVER (ORDER BY g.expires_at,a.grant_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS prior " +
    "FROM ai_credit_allocations a JOIN ai_credit_grants g ON g.grant_id=a.grant_id WHERE a.reservation_id=?1) " +
    "UPDATE ai_credit_allocations SET consumed_credits=(" +
    "SELECT MIN(r.reserved_credits,MAX(0,?2-r.prior)) FROM ranked r WHERE r.rid=ai_credit_allocations.rowid) " +
    "WHERE reservation_id=?1 AND EXISTS(SELECT 1 FROM ai_credit_reservations WHERE reservation_id=?1 AND state='reserved')"
  ).bind(args.reservationId,charge);
  const finalize = db.prepare(
    "UPDATE ai_credit_reservations SET state=?2,actual_charge=?3,settled_at=?4 " +
    "WHERE reservation_id=?1 AND state='reserved'"
  ).bind(args.reservationId,args.success?"settled":"released",charge,at.toISOString());
  await db.batch([rankedUpdate,finalize]);
  return {reservationId:args.reservationId,state:args.success?"settled":"released",
    maxCharge:row.max_charge,actualCharge:charge,replayed:false};
}

export async function releaseStaleReservations(db: CommercialDatabase, at = new Date(), limit = 50): Promise<number> {
  checkAmount(limit,"SWEEP_LIMIT");
  const rows = await db.prepare(
    "SELECT reservation_id,organization_hash,app_id FROM ai_credit_reservations " +
    "WHERE state='reserved' AND expires_at<?1 ORDER BY expires_at LIMIT ?2"
  ).bind(at.toISOString(),Math.min(500,limit)).all<{reservation_id:string;organization_hash:string;app_id:string}>();
  let count=0;
  for (const row of rows.results ?? []) {
    // The database trigger releases the exact original grant allocations.
    const result = await db.prepare(
      "UPDATE ai_credit_reservations SET state='released',actual_charge=0,settled_at=?2 " +
      "WHERE reservation_id=?1 AND state='reserved'"
    ).bind(row.reservation_id,at.toISOString()).run();
    count += Number(result.meta?.changes ?? 0);
  }
  return count;
}

export async function recordProviderCost(
  db: CommercialDatabase,
  args: CreditContext & {
    requestRef:string; taskId:string; providerId:string; modelId:string;
    tokensIn?:number; tokensOut?:number; audioSeconds?:number; imageUnits?:number;
    estimateMicroUsd?:number | null; actualMicroUsd?:number | null; priceSnapshot?:string | null;
  },
): Promise<void> {
  for (const value of [args.tokensIn,args.tokensOut,args.audioSeconds,args.imageUnits,args.estimateMicroUsd,args.actualMicroUsd]) {
    if (value !== undefined && value !== null) checkAmount(value,"USAGE",true);
  }
  const orgHash = await sha256(args.organizationId);
  await db.prepare(
    "INSERT INTO ai_provider_cost(request_ref,organization_hash,app_id,task_id,provider_id,model_id," +
    "tokens_in,tokens_out,audio_seconds,image_units,estimate_micro_usd,actual_micro_usd,price_snapshot,created_at) " +
    "VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14) ON CONFLICT(request_ref) DO NOTHING"
  ).bind(args.requestRef,orgHash,args.appId,args.taskId,args.providerId,args.modelId,
    args.tokensIn??null,args.tokensOut??null,args.audioSeconds??null,args.imageUnits??null,
    args.estimateMicroUsd??null,args.actualMicroUsd??null,args.priceSnapshot??null,new Date().toISOString()).run();
}
