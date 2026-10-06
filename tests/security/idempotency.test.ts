import { describe, expect, it } from "vitest";
import { lookupIdempotency } from "../../packages/idempotency/src/index.js";

function fakeDb(row:unknown) {
  return {
    prepare:()=>({
      bind(){return this;},
      first:async()=>row,
      run:async()=>({}),
      all:async()=>({results:[]}),
    }),
  } as never;
}

describe("idempotency",()=>{
  it("returns MISS for a new key",async()=>{
    const result=await lookupIdempotency(fakeDb(null),{
      organizationId:"org-a",appId:"connect",taskId:"connect.reply.suggest",key:"request-12345678"
    },{x:1},new Date("2026-10-06T12:00:00Z"));
    expect(result.state).toBe("MISS");
  });

  it("rejects reusing a key for a different request",async()=>{
    const result=await lookupIdempotency(fakeDb({
      request_hash:"different",
      status:"completed",
      result_json:"{}",
      expires_at:"2026-10-07T12:00:00Z",
    }),{
      organizationId:"org-a",appId:"connect",taskId:"connect.reply.suggest",key:"request-12345678"
    },{x:1},new Date("2026-10-06T12:00:00Z"));
    expect(result.state).toBe("CONFLICT");
  });

  it("does not cross tenant scope",async()=>{
    const a=await lookupIdempotency(fakeDb(null),{
      organizationId:"org-a",appId:"connect",taskId:"connect.reply.suggest",key:"same-key-123"
    },{x:1});
    const b=await lookupIdempotency(fakeDb(null),{
      organizationId:"org-b",appId:"connect",taskId:"connect.reply.suggest",key:"same-key-123"
    },{x:1});
    expect(a.organizationHash).not.toBe(b.organizationHash);
  });
});
