import { describe, expect, it, vi } from "vitest";
import { buildCacheKey, cacheAllowed, cacheGet, cachePut } from "../../packages/cache/src/index.js";

describe("privacy-aware cache",()=>{
  it("never caches P2/P3/P4",()=>{
    expect(cacheAllowed("P2_PERSONAL","tenant")).toBe(false);
    expect(cacheAllowed("P3_SENSITIVE","tenant")).toBe(false);
    expect(cacheAllowed("P4_RESTRICTED","tenant")).toBe(false);
  });

  it("includes organization in otherwise identical cache keys",async()=>{
    const base={
      taskId:"affiliate.pin.copy",taskVersion:1,promptVersion:1,policyVersion:1,
      locale:"pt-BR",sensitivity:"P0_PUBLIC" as const,input:{product:"x"},
    };
    const a=await buildCacheKey({...base,organizationId:"org-a"});
    const b=await buildCacheKey({...base,organizationId:"org-b"});
    expect(a).not.toBe(b);
  });

  it("reads and writes eligible values with TTL",async()=>{
    const store=new Map<string,string>();
    const kv={
      get:vi.fn(async(key:string)=>store.get(key)??null),
      put:vi.fn(async(key:string,value:string)=>{store.set(key,value);}),
      delete:vi.fn(async(key:string)=>{store.delete(key);}),
    };
    const context={
      taskId:"affiliate.pin.copy",taskVersion:1,promptVersion:1,policyVersion:1,
      locale:"pt-BR",organizationId:"org-a",sensitivity:"P0_PUBLIC" as const,input:{product:"x"},
    };
    await cachePut(kv,context,"tenant",300,{ok:true});
    await expect(cacheGet(kv,context,"tenant")).resolves.toEqual({ok:true});
    expect(kv.put).toHaveBeenCalledOnce();
  });
});
