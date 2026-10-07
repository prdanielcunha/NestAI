# Architecture

## Canonical path

MillionsNest app → `@millionsnest/ai` → Hub short-lived token/App Check or approved service exchange → NestAI Edge API → Auth/Tenant → Privacy Firewall → Policy Engine → Cost Guard → deterministic Router → provider adapter.

Apps request task IDs, never provider/model IDs.

## Control plane

The registries define applications, tasks, providers, models, prompts, structured-output contracts, privacy and promotion state. Mission Control reads the same control-plane data used by runtime policy.

## Providers

Production-capable paths are Cloudflare Workers AI, Groq and restricted Gemini. Mistral remains registered but fail-closed while quota-blocked. Qwen3.8 is a candidate. NVIDIA NIM is structurally isolated to sanitized Evaluation Lab execution and is impossible for normal customer routing.

## RAG

Knowledge retrieval is tenant/app/sensitivity scoped before reranking. Retrieved data is untrusted. Prompt Guard and Policy Engine protect the final context; evidence validation protects grounded outputs.

## Local AI

`local:webgpu` is a first-class capability boundary for simple on-device tasks. Runtime detection chooses WebGPU, then reasonable WASM/CPU execution, otherwise a policy-safe cloud fallback. P4 has no cloud fallback.

## Jobs and media

Vision, transcription, embeddings, image generation and async jobs use the same task/policy/auth model as text calls. Provider choice remains centralized.

## Cost architecture

FREE_ONLY is enforced at boot/policy/router and by quota guards. Provider/model quota metadata is dated and source-linked. R2 additionally has a conservative NestAI account-share allocation and atomic conditional reservations to avoid concurrent callers crossing the configured guard.

## Consumer status

The eight canonical application repositories now contain NestAI cutovers on their main branches:
Hub, Connect, NestLocal, MusicScale, NestFinance, NestJourney, NestAffiliate and NestLume. Production promotion/live certification remains a separate release gate and is not inferred solely from a merged branch.
