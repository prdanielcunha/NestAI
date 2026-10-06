import { describe, expect, it } from "vitest";
import { resetGitHubWorkloadJwksCacheForTests, verifyGitHubWorkloadToken } from "../../packages/workload-auth/src/index.js";

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function issue(overrides: Record<string, unknown> = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: "SHA-256" },
    true,
    ["sign","verify"],
  );
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const now = 2_000_000_000;
  const header = encode({ alg:"RS256", typ:"JWT", kid:"gh-test" });
  const payload = encode({
    iss:"https://token.actions.githubusercontent.com",
    aud:"nestai-app-register",
    sub:"repo:prdanielcunha/example-app:ref:refs/heads/main",
    repository:"prdanielcunha/example-app",
    repository_owner:"prdanielcunha",
    ref:"refs/heads/main",
    sha:"abc123",
    iat:now-5,
    exp:now+300,
    ...overrides,
  });
  const input = header+"."+payload;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(input));
  return {
    token:input+"."+Buffer.from(signature).toString("base64url"),
    publicJwk:{...jwk,kid:"gh-test",alg:"RS256",use:"sig"},
    now,
  };
}

function jwksFetch(jwk:JsonWebKey):typeof fetch {
  return (async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200,headers:{"content-type":"application/json"}})) as typeof fetch;
}

describe("GitHub workload identity",()=>{
  it("accepts exact repository workload",async()=>{
    resetGitHubWorkloadJwksCacheForTests();
    const x=await issue();
    const claims=await verifyGitHubWorkloadToken(x.token,{
      audience:"nestai-app-register",
      repositoryOwner:"prdanielcunha",
      expectedRepository:"prdanielcunha/example-app",
      nowSeconds:x.now,
      fetcher:jwksFetch(x.publicJwk),
    });
    expect(claims.sha).toBe("abc123");
  });

  it("rejects another repository even under the same owner",async()=>{
    resetGitHubWorkloadJwksCacheForTests();
    const x=await issue();
    await expect(verifyGitHubWorkloadToken(x.token,{
      audience:"nestai-app-register",
      repositoryOwner:"prdanielcunha",
      expectedRepository:"prdanielcunha/other-app",
      nowSeconds:x.now,
      fetcher:jwksFetch(x.publicJwk),
    })).rejects.toThrow("WORKLOAD_REPOSITORY_MISMATCH");
  });

  it("rejects foreign repository owner",async()=>{
    resetGitHubWorkloadJwksCacheForTests();
    const x=await issue({repository_owner:"attacker",repository:"attacker/repo"});
    await expect(verifyGitHubWorkloadToken(x.token,{
      audience:"nestai-app-register",
      repositoryOwner:"prdanielcunha",
      nowSeconds:x.now,
      fetcher:jwksFetch(x.publicJwk),
    })).rejects.toThrow("WORKLOAD_OWNER_DENIED");
  });
});
