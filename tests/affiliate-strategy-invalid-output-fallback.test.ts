import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {CircuitBreaker,executeWithSafeFallback,isTransientProviderError} from "../packages/resilience/src/index.js";
import {validateStructuredText} from "../packages/structured-output/src/index.js";

describe("affiliate.pin.strategy invalid JSON provider recovery",()=>{
 it("reclassifies invalid AI JSON as safe provider fallback without leaking output",()=>{
  const source=readFileSync(new URL("../apps/api/src/index.ts",import.meta.url),"utf8");
  expect(source).toContain('throw new Error("PROVIDER_TEMPORARY_INVALID_OUTPUT")');
  expect(()=>validateStructuredText("affiliate.pin.strategy","not JSON")).toThrow("OUTPUT_SCHEMA_INVALID_JSON");
  expect(isTransientProviderError(new Error("PROVIDER_TEMPORARY_INVALID_OUTPUT"))).toBe(true);
 });
 it("uses second distinct FREE provider with zero retries after malformed first output",async()=>{
  const seen:string[]=[];
  const result=await executeWithSafeFallback({
   candidates:["groq","cloudflare"],keyOf:x=>x,
   breaker:new CircuitBreaker(),maxRetriesPerCandidate:0,
   execute:async({candidate})=>{
    seen.push(candidate);
    if(candidate==="groq")throw new Error("PROVIDER_TEMPORARY_INVALID_OUTPUT");
    return {title:"safe suggestion"};
   },
  });
  expect(seen).toEqual(["groq","cloudflare"]);
  expect(result.fallbackUsed).toBe(true);
  expect(result.retries).toBe(1);
 });
 it("keeps authorization errors fail-closed",async()=>{
  const seen:string[]=[];
  await expect(executeWithSafeFallback({
   candidates:["groq","cloudflare"],keyOf:x=>x,
   breaker:new CircuitBreaker(),maxRetriesPerCandidate:0,
   execute:async({candidate})=>{seen.push(candidate);throw new Error("AUTH_TOKEN_REJECTED");},
  })).rejects.toThrow("AUTH_TOKEN_REJECTED");
  expect(seen).toEqual(["groq"]);
 });
});
