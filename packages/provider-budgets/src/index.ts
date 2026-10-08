/** Worst-case provider cost budget reservations. A commercial CREDIT is not USD.
 * Paid inference cannot be enabled until every required scoped USD budget exists,
 * is active and has capacity. The D1 batch/trigger ledger is authoritative.
 * No function in this module enables paid providers or changes a plan.
 */
import type {D1DatabaseLike,D1Statement} from "../../usage-ledger/src/index.js";
import {sha256} from "../../commercial-credits/src/index.js";

export type BudgetScopeType=
  'global'|'environment'|'provider'|'task'|'app'|'organization'|'user'|'trial';
export type BudgetWindow={type:BudgetScopeType;id:string;key:string};
export type BudgetDatabase=D1DatabaseLike&{
  batch(statements:D1Statement[]):Promise<unknown[]>;
};
export type BudgetRequest={
  organizationId:string;appId:string;taskId:string;providerId:string;
  environment:string;idempotencyKey:string;estimateMicroUsd:number;
  userId?:string;trial?:boolean;
};
export type ProviderBudgetHold={
  holdId:string;state:'reserved'|'settled'|'released';
  estimateMicroUsd:number;actualMicroUsd:number;replayed:boolean;
};
function id(value:string,name:string){
  if(typeof value!=='string'||value.length<2||value.length>200||
    !/^[A-Za-z0-9:._-]+$/.test(value))throw Error('AI_BUDGET_INVALID_'+name);
  return value;
}
function cents(value:number,name:string,zero=false){
  if(!Number.isSafeInteger(value)||(zero?value<0:value<=0))
    throw Error('AI_BUDGET_INVALID_'+name);
  return value;
}
function window(type:BudgetScopeType,idValue:string):BudgetWindow{
  return {type,id:idValue,key:'nestai:budget:'+type+':'+idValue};
}
export async function budgetWindowsForRequest(input:BudgetRequest):Promise<BudgetWindow[]>{
  id(input.organizationId,'ORG');id(input.appId,'APP');
  id(input.taskId,'TASK');id(input.providerId,'PROVIDER');
  id(input.environment,'ENVIRONMENT');id(input.idempotencyKey,'IDEMPOTENCY_KEY');
  const organizationHash=await sha256(input.organizationId);
  const windows:BudgetWindow[]=[
    window('global','all'),window('environment',input.environment),
    window('provider',input.providerId),window('task',input.taskId),
    window('app',input.appId),window('organization',organizationHash),
  ];
  if(input.userId)windows.push(window('user',await sha256(id(input.userId,'USER'))));
  if(input.trial===true)windows.push(window('trial',organizationHash+':'+input.appId));
  if(windows.length<5||windows.length>8)throw Error('AI_BUDGET_INVALID_SCOPES');
  return windows;
}
async function previouslyReserved(
  db:BudgetDatabase,holdId:string,input:BudgetRequest,
  expectedFingerprint:string,
):Promise<ProviderBudgetHold|null>{
  const r=await db.prepare(
    'SELECT provider_id,scope_fingerprint,estimate_micro_usd,finalized_micro_usd,state '+
    'FROM ai_provider_budget_holds WHERE hold_id=?1'
  ).bind(holdId).first<{
    provider_id:string;scope_fingerprint:string;estimate_micro_usd:number;
    finalized_micro_usd:number|null;state:string;
  }>();
  if(!r)return null;
  if(r.provider_id!==input.providerId||r.scope_fingerprint!==expectedFingerprint||
    r.estimate_micro_usd!==input.estimateMicroUsd)
    throw Error('AI_BUDGET_IDEMPOTENCY_CONFLICT');
  if(r.state==='pending')throw Error('AI_BUDGET_REQUEST_IN_PROGRESS');
  if(!['reserved','settled','released'].includes(r.state))
    throw Error('AI_BUDGET_STATE_INVALID');
  return {holdId,state:r.state as ProviderBudgetHold['state'],
    estimateMicroUsd:r.estimate_micro_usd,actualMicroUsd:r.finalized_micro_usd??0,replayed:true};
}
/** Reserve worst-case micro-USD across ALL scopes or nothing. Missing window fails closed. */
export async function reserveProviderBudget(
  db:BudgetDatabase,input:BudgetRequest,now=new Date(),
):Promise<ProviderBudgetHold>{
  cents(input.estimateMicroUsd,'ESTIMATE');
  const scopes=await budgetWindowsForRequest(input);
  const orgHash=await sha256(input.organizationId);
  const keyHash=await sha256(input.idempotencyKey);
  const holdId=await sha256([orgHash,input.appId,input.taskId,keyHash].join(':'));
  const fingerprint=await sha256(scopes.map(w=>w.key).join('|'));
  const old=await previouslyReserved(db,holdId,input,fingerprint);
  if(old)return old;
  if(!Number.isFinite(now.getTime()))throw Error('AI_BUDGET_INVALID_TIME');
  const createdAt=now.toISOString();
  const expiresAt=new Date(now.getTime()+20*60_000).toISOString();
  const statements:D1Statement[]=[
    db.prepare(
      'INSERT INTO ai_provider_budget_holds(hold_id,organization_hash,app_id,task_id,'+
      'provider_id,request_key_hash,scope_fingerprint,estimate_micro_usd,'+
      'required_windows,created_at,expires_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)'
    ).bind(holdId,orgHash,input.appId,input.taskId,input.providerId,
      keyHash,fingerprint,input.estimateMicroUsd,scopes.length,createdAt,expiresAt),
    ...scopes.map(scope=>db.prepare(
      'INSERT INTO ai_provider_budget_allocations(hold_id,budget_key,scope_type,estimate_micro_usd) '+
      'VALUES(?1,?2,?3,?4)'
    ).bind(holdId,scope.key,scope.type,input.estimateMicroUsd)),
    db.prepare(
      "UPDATE ai_provider_budget_holds SET state='reserved' WHERE hold_id=?1 AND state='pending'"
    ).bind(holdId),
  ];
  try{await db.batch(statements);}catch(error){
    const duplicate=await previouslyReserved(db,holdId,input,fingerprint);
    if(duplicate)return duplicate;
    const message=error instanceof Error?error.message:'';
    if(message.includes('AI_GLOBAL_BUDGET_REACHED')||
       message.includes('CHECK constraint failed'))
      throw Error('AI_GLOBAL_BUDGET_REACHED');
    throw error;
  }
  return {holdId,state:'reserved',estimateMicroUsd:input.estimateMicroUsd,
    actualMicroUsd:0,replayed:false};
}
/** Only a known-cost validated provider result settles. Failures release in full. */
export async function finalizeProviderBudget(
  db:BudgetDatabase,
  args:{holdId:string;success:boolean;actualMicroUsd:number},
  now=new Date(),
):Promise<ProviderBudgetHold>{
  id(args.holdId,'HOLD_ID');cents(args.actualMicroUsd,'ACTUAL',true);
  const current=await db.prepare(
    'SELECT state,estimate_micro_usd,finalized_micro_usd FROM ai_provider_budget_holds WHERE hold_id=?1'
  ).bind(args.holdId).first<{
    state:string;estimate_micro_usd:number;finalized_micro_usd:number|null;
  }>();
  if(!current)throw Error('AI_BUDGET_HOLD_NOT_FOUND');
  const target=args.success?'settled':'released';
  const actual=args.success?args.actualMicroUsd:0;
  if(actual>current.estimate_micro_usd)throw Error('AI_BUDGET_ACTUAL_EXCEEDS_RESERVATION');
  if(current.state==='settled'||current.state==='released'){
    if(current.state!==target||current.finalized_micro_usd!==actual)
      throw Error('AI_BUDGET_FINALIZATION_CONFLICT');
    return {holdId:args.holdId,state:target,
      estimateMicroUsd:current.estimate_micro_usd,actualMicroUsd:actual,replayed:true};
  }
  if(current.state!=='reserved')throw Error('AI_BUDGET_HOLD_NOT_READY');
  await db.batch([
    db.prepare(
      'UPDATE ai_provider_budget_allocations SET finalized_micro_usd=?2 '+
      'WHERE hold_id=?1 AND finalized_micro_usd IS NULL'
    ).bind(args.holdId,actual),
    db.prepare(
      'UPDATE ai_provider_budget_holds SET state=?2,finalized_micro_usd=?3,finalized_at=?4 '+
      "WHERE hold_id=?1 AND state='reserved'"
    ).bind(args.holdId,target,actual,now.toISOString()),
  ]);
  return {holdId:args.holdId,state:target,
    estimateMicroUsd:current.estimate_micro_usd,actualMicroUsd:actual,replayed:false};
}
/** Expired holds are never silently charged. The journal remains immutable. */
export async function releaseExpiredProviderBudget(
  db:BudgetDatabase,now=new Date(),limit=50,
):Promise<number>{
  cents(limit,'SWEEP_LIMIT');
  const pending=await db.prepare(
    "SELECT hold_id FROM ai_provider_budget_holds WHERE state='reserved' AND expires_at<?1 "+
    'ORDER BY expires_at LIMIT ?2'
  ).bind(now.toISOString(),Math.min(limit,250))
    .all<{hold_id:string}>();
  let released=0;
  for(const row of pending.results??[]){
    try{
      await finalizeProviderBudget(db,{holdId:row.hold_id,success:false,actualMicroUsd:0},now);
      released++;
    }catch(error){
      if(!(error instanceof Error)||!error.message.includes('AI_BUDGET_FINALIZATION_CONFLICT'))throw error;
    }
  }
  return released;
}
