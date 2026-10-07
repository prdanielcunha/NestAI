# NestAI — MillionsNest Intelligence Platform

Central AI control plane and execution runtime for the MillionsNest ecosystem.

## Status — 2026-10-07

The core runtime is deployed at `https://ai.millionsnest.com` in FREE_ONLY mode. The eight canonical MillionsNest applications have completed their code-level NestAI cutover on `main`; production promotion and live app-by-app certification remain explicit release gates.

Implemented and CI-gated:
- Hub ES256/JWKS short-lived tokens, tenant/app/capability enforcement and App Check.
- P0–P4 Privacy Firewall and deterministic Policy/Router.
- Cloudflare Workers AI + Groq production paths; Gemini restricted fallback.
- Mistral fail-closed when quota-blocked.
- Prompt Guard defense-in-depth.
- RAG/Vectorize with tenant isolation and optional BGE reranking.
- BGE-M3 and Qwen3.8 candidates behind promotion gates.
- NVIDIA NIM sanitized Evaluation Lab only.
- local WebGPU/WASM capability foundation with P4 local-only boundary.
- D1/KV/Queues/Vectorize/R2 infrastructure and zero-cost guards.
- structured output, streaming, media/jobs and metadata-only observability.
- `@millionsnest/ai` SDK and 8/8 app manifests/cutovers.
- PT-BR / English / Spanish foundations.

## Core rule

Applications request canonical tasks; they never select provider/model IDs and never receive provider API keys.

```ts
const ai = createNestAiClient({
  appId: "nestlume",
  organizationId,
  getToken,
  getAppCheckToken,
});

const result = await ai.run({
  task: "nestlume.study.grounded",
  input,
});
```

Canonical blueprint: `docs/NESTAI_MASTER_BLUEPRINT.md`  
Implementation evidence: `docs/BLUEPRINT_IMPLEMENTATION_MATRIX.md`  
Production gates: `docs/RELEASE_CHECKLIST.md`
