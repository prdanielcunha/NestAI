# NestAI — MillionsNest Intelligence Platform

Central AI control plane and execution runtime for the MillionsNest ecosystem.

## Current status

**Architecture 1.2 core runtime implemented on `main`; production is not yet deployed.**

Implemented and CI-gated:
- FREE_ONLY policy and Cost Guard.
- Short-lived Hub ES256 token verification with tenant/app/capability enforcement.
- P0-P4 Privacy Firewall.
- Deterministic model/provider router.
- Groq + Cloudflare Workers AI adapters.
- Cloudflare Worker `/health` and `/v1/run`.
- Native rate-limit binding and D1 daily usage ledger.
- Metadata-only observability.
- Thin client SDK.
- Tenant-scoped RAG and bounded job primitives.
- PT-BR / English / Spanish locale foundation.
- Evaluation release gate and ecosystem app manifests.
- Wrangler deployment dry-run in CI.

Not yet claimed as deployed:
- Real Cloudflare D1/resource provisioning and migrations.
- Cloudflare production deployment/custom domain.
- Live Hub signing-key integration and live provider smoke tests.
- Vectorize/R2/Queues concrete account bindings.
- Intelligence Mission Control console.
- Direct rollout into each ecosystem app.

## Core rule

Applications request canonical tasks; they never choose provider/model IDs and never receive provider API keys.

```ts
const ai = new NestAiClient({
  baseUrl: "https://ai.millionsnest.com",
  organizationId,
  getToken: () => hub.getNestAiToken(),
});
const result = await ai.run({ task: "nestlume.study.answer", input });
```

Canonical architecture: `docs/NESTAI_MASTER_BLUEPRINT.md`.  
Production gates: `docs/RELEASE_CHECKLIST.md`.  
Cloudflare account contract: `docs/CLOUDFLARE_PROVISIONING.md`.
