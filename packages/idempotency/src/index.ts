import type { D1DatabaseLike } from "../../usage-ledger/src/index.js";

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}

export type IdempotencyScope = {
  organizationId: string;
  appId: string;
  taskId: string;
  key: string;
};

export type IdempotencyLookup =
  | { state:"MISS"; keyHash:string; organizationHash:string }
  | { state:"REPLAY"; result:unknown; keyHash:string; organizationHash:string }
  | { state:"CONFLICT"; keyHash:string; organizationHash:string }
  | { state:"IN_PROGRESS"; keyHash:string; organizationHash:string };

export async function lookupIdempotency(
  db:D1DatabaseLike,
  scope:IdempotencyScope,
  requestPayload:unknown,
  now=new Date(),
):Promise<IdempotencyLookup> {
  if (!scope.key || scope.key.length < 8 || scope.key.length > 200) throw new Error("IDEMPOTENCY_KEY_INVALID");
  const [organizationHash,keyHash,requestHash]=await Promise.all([
    sha256(scope.organizationId),
    sha256(scope.key),
    sha256(JSON.stringify(requestPayload)),
  ]);

  const row=await db.prepare(
    "SELECT request_hash, status, result_json, expires_at FROM idempotency_records " +
    "WHERE organization_id_hash=?1 AND app_id=?2 AND task_id=?3 AND idempotency_key_hash=?4"
  ).bind(organizationHash,scope.appId,scope.taskId,keyHash).first<{
    request_hash:string; status:string; result_json:string|null; expires_at:string;
  }>();

  if (!row || new Date(row.expires_at).getTime() <= now.getTime()) {
    return {state:"MISS",keyHash,organizationHash};
  }
  if (row.request_hash !== requestHash) return {state:"CONFLICT",keyHash,organizationHash};
  if (row.status === "completed" && row.result_json) {
    return {state:"REPLAY",result:JSON.parse(row.result_json),keyHash,organizationHash};
  }
  return {state:"IN_PROGRESS",keyHash,organizationHash};
}

export async function claimIdempotency(
  db:D1DatabaseLike,
  scope:IdempotencyScope,
  requestPayload:unknown,
  ttlSeconds=86400,
  now=new Date(),
):Promise<{keyHash:string;organizationHash:string}> {
  const lookup=await lookupIdempotency(db,scope,requestPayload,now);
  if (lookup.state === "CONFLICT") throw new Error("IDEMPOTENCY_KEY_REUSE_CONFLICT");
  if (lookup.state === "REPLAY") throw new Error("IDEMPOTENCY_ALREADY_COMPLETED");
  if (lookup.state === "IN_PROGRESS") throw new Error("IDEMPOTENCY_IN_PROGRESS");

  const requestHash=await sha256(JSON.stringify(requestPayload));
  const expiresAt=new Date(now.getTime()+ttlSeconds*1000).toISOString();
  await db.prepare(
    "INSERT INTO idempotency_records(organization_id_hash,app_id,task_id,idempotency_key_hash,request_hash,status,result_json,created_at,expires_at) " +
    "VALUES (?1,?2,?3,?4,?5,'in_progress',NULL,?6,?7) " +
    "ON CONFLICT(organization_id_hash,app_id,task_id,idempotency_key_hash) DO UPDATE SET " +
    "request_hash=excluded.request_hash,status='in_progress',result_json=NULL,created_at=excluded.created_at,expires_at=excluded.expires_at"
  ).bind(
    lookup.organizationHash,scope.appId,scope.taskId,lookup.keyHash,requestHash,now.toISOString(),expiresAt
  ).run();
  return {keyHash:lookup.keyHash,organizationHash:lookup.organizationHash};
}

export async function completeIdempotency(
  db:D1DatabaseLike,
  args:{organizationHash:string;appId:string;taskId:string;keyHash:string;result:unknown},
):Promise<void> {
  await db.prepare(
    "UPDATE idempotency_records SET status='completed', result_json=?1 " +
    "WHERE organization_id_hash=?2 AND app_id=?3 AND task_id=?4 AND idempotency_key_hash=?5"
  ).bind(JSON.stringify(args.result),args.organizationHash,args.appId,args.taskId,args.keyHash).run();
}
