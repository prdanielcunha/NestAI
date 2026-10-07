# Provider Registry Review

Last reviewed: 2026-10-07

## Runtime strategy

NestAI is the only AI routing authority for MillionsNest applications. Consumers call canonical task IDs through `@millionsnest/ai`; they do not select providers/models and never receive provider secrets.

Routing order is privacy and authorization first, then capability, FREE_ONLY eligibility, health, quality, latency and quota. Provider/model failures may reduce capability but may never weaken sensitivity policy or enable paid fallback.

## Current provider state

| Provider | Role | Customer traffic | Sensitive data | Current state |
| --- | --- | --- | --- | --- |
| Cloudflare Workers AI | central/private fallback, P3, RAG, vision, image, transcription | yes | up to task policy; P3 preferred | production |
| Groq GPT-OSS 120B/20B | text/reasoning/structured/transcription | yes | only policy-eligible tasks | production |
| Groq Qwen3.8-27B | candidate text/vision/reasoning | no until promotion gates pass | no customer data while candidate | candidate |
| Groq Prompt Guard 2 86M | prompt-injection classifier | security sub-call only | P0-P2 after minimization; P3/P4 never sent | enabled behind flag |
| Gemini 3.5 Flash-Lite | restricted fallback | P0/P1 allowlisted only | P2/P3/P4 prohibited | production-restricted |
| Mistral Small | laboratory fallback | no | no | configured but quota_blocked |
| NVIDIA NIM | Evaluation Lab | never | sanitized P0/P1 only | evalOnly |
| local:webgpu | on-device simple capabilities | device-local | may handle P4 locally | foundation/candidate |

## Cloudflare Workers AI

Uses the Worker `AI` binding; there is no provider API key in consumer apps. It remains the central privacy-preserving provider and the only external path allowed for current P3 AI extraction tasks.

RAG candidates:
- `@cf/google/embeddinggemma-300m` — current production embedding.
- `@cf/baai/bge-m3` — 1024-dimensional multilingual candidate; Evaluation Lab only until promoted.
- `@cf/baai/bge-reranker-base` — reranker, enabled with a kill switch and deterministic vector-order fallback.

## Groq

Worker secret: `GROQ_API_KEY`. The same backend-only key is shared by authorized Groq models.

Registered:
- `openai/gpt-oss-120b` — production reasoning/quality.
- `openai/gpt-oss-20b` — production fast path.
- `qwen/qwen3.8-27b` — candidate only.
- `meta-llama/llama-prompt-guard-2-86m` — defense-in-depth prompt-injection classifier.
- Whisper V3 Turbo — transcription where task policy permits.

Quota metadata is reviewed and dated in the registries/cost guard; limits are not treated as eternal constants.

## Gemini Free

Worker secret: `GEMINI_API_KEY`. Production probe is currently ready.

Gemini Free remains restricted because free-tier data handling is not appropriate for MillionsNest personal/sensitive workloads. P2/P3/P4 are blocked. No consumer app contains the Gemini key.

## Mistral

Worker secret: `MISTRAL_API_KEY`. The key authenticates but the production entitlement probe currently reports `quota_blocked`. Mistral remains fail-closed/laboratory and is not required for any app feature.

No paid upgrade or pay-as-you-go fallback is permitted.

## NVIDIA NIM

Worker secret: `NVIDIA_API_KEY`, already configured. NVIDIA is explicitly `evalOnly`:
- `productionTrafficAllowed=false`
- `customerTrafficAllowed=false`
- P2/P3/P4 denied
- sanitized/synthetic Evaluation Lab data only

The normal Router cannot select NVIDIA.

## Local / WebGPU

The local runtime exposes capability detection, WebGPU/WASM fallback orchestration, normalization and PII pre-detection foundations. Apps do not know a concrete local model ID. P4 is never sent to a remote provider; if a P4 capability requires AI and local execution is unavailable, the operation fails closed.

## FREE_ONLY

`AI_BILLING_MODE=FREE_ONLY`, `ALLOW_PAID_FALLBACK=false`, `AUTO_UPGRADE_PROVIDER=false` are invariants. Adapters may exist for future providers, but no paid execution is reachable in FREE_ONLY.
