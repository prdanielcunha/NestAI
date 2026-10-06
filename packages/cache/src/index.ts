import type { Sensitivity } from "../../contracts/src/index.js";

export interface KvNamespaceLike {
  get(key:string):Promise<string|null>;
  put(key:string,value:string,options?:{expirationTtl?:number}):Promise<void>;
  delete(key:string):Promise<void>;
}

export type CacheContext = {
  taskId:string;
  taskVersion:number;
  promptVersion:number;
  policyVersion:number;
  locale:string;
  organizationId:string;
  sensitivity:Sensitivity;
  input:unknown;
};

async function hash(value:string):Promise<string>{
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes)).map((b)=>b.toString(16).padStart(2,"0")).join("");
}

export function cacheAllowed(sensitivity:Sensitivity,mode:"disabled"|"tenant"):boolean{
  if(mode==="disabled") return false;
  return sensitivity==="P0_PUBLIC" || sensitivity==="P1_INTERNAL";
}

export async function buildCacheKey(context:CacheContext):Promise<string>{
  const inputHash=await hash(JSON.stringify(context.input));
  const orgHash=await hash(context.organizationId);
  return [
    "v1",
    context.taskId,
    "tv"+context.taskVersion,
    "pv"+context.promptVersion,
    "policy"+context.policyVersion,
    context.locale,
    orgHash.slice(0,24),
    inputHash,
  ].join(":");
}

export async function cacheGet<T>(
  kv:KvNamespaceLike|undefined,
  context:CacheContext,
  mode:"disabled"|"tenant",
):Promise<T|null>{
  if(!kv || !cacheAllowed(context.sensitivity,mode)) return null;
  const key=await buildCacheKey(context);
  const value=await kv.get(key);
  if(!value) return null;
  return JSON.parse(value) as T;
}

export async function cachePut(
  kv:KvNamespaceLike|undefined,
  context:CacheContext,
  mode:"disabled"|"tenant",
  ttlSeconds:number,
  value:unknown,
):Promise<void>{
  if(!kv || ttlSeconds<=0 || !cacheAllowed(context.sensitivity,mode)) return;
  const key=await buildCacheKey(context);
  await kv.put(key,JSON.stringify(value),{expirationTtl:Math.max(30,ttlSeconds)});
}
