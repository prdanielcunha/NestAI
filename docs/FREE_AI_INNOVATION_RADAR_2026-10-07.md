# NestAI — Free AI Innovation Radar (2026-10-07)

Status: research and candidate registration; **no new customer inference route enabled**.
Canonical scope: FREE_ONLY; PRIVACY BEFORE ROUTING; EVIDENCE FIRST.

## Current baseline — avoid redundant implementations
Already integrated or registered:
- Groq GPT-OSS 20B/120B, Whisper, Qwen 3.8 (candidate);
- Cloudflare GLM-4.7-Flash, Gemma 4 26B, Nemotron 3, EmbeddingGemma,
  BGE-M3 and reranker (candidates), Whisper and FLUX;
- Gemini 3.5 Flash-Lite (P0/P1 approved-only laboratory), Transformers.js/WebGPU candidate.
Existing candidate metadata does not prove functioning inference, user acceptance, or API credentials.

## Three new candidates — fail closed

| Candidate | API model ID | Free evidence | Allowed evaluation | Future feature |
| --- | --- | --- | --- | --- |
| GPT-OSS Safeguard 20B / Groq | `openai/gpt-oss-safeguard-20b` | listed under Free Plan Limits | synthetic P0/P1 safety-policy classification, not private user messages | second-opinion safety classifier for autonomous content and tools |
| Gemini 3.7 Flash | `gemini-3.7-flash` | Standard Free Tier per Gemini pricing | synthetic P0/P1 instruction / extraction benchmarks | more accurate high-variance extraction and compositional reasoning |
| Gemini 3.8 Flash-Lite TTS | `gemini-3.8-flash-lite-tts` | Standard Free Tier per Gemini pricing | only non-sensitive public text in Portuguese, English and Spanish | NestLume public study narration, public MusicScale tutorial and demo narration |

Sources:
- https://console.groq.com/docs/rate-limits
- https://console.groq.com/docs/model/openai/gpt-oss-safeguard-20b
- https://ai.google.dev/gemini-api/docs/pricing
- https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash-lite-tts
- https://developers.cloudflare.com/workers-ai/platform/pricing/

### Non-negotiable guardrails
1. Models remain `preview`, `candidate`, `evalOnly:true`,
   `customerTrafficAllowed:false` and `productionTrafficAllowed:false`.
2. Model registry entries are **not** deployment of an adapter or an inference route.
   TTS requires a new `audio_out` contract, privacy checks, user-facing controls,
   content-length budgets, optional file generation and explicit opt-in.
3. Never send P2/P3/P4 information to Gemini Free (Free Tier prompts/data
   may be used to improve Google's products). For speech, don't send
   phone calls, personal pastoral notes, receipts, private conversations, or
   user-uploaded texts until provider data policy and commercial requirements
   have been independently approved.
4. The Safeguard model may assist with content classification, but cannot
   replace deterministic app authorization, RAG tenant filtering, DLP or
   human approval for sensitive tool actions.
5. Free API limits are subject to provider change. A model being in the
   catalog is **not** proof it can be used under the customer's account plan.
6. Never auto-upgrade to a paid tier, prepay credits, or provision paid
   capacity. Fail closed with a visible retry/queue/manual alternative.
7. No AI provider must generate or send WhatsApp messages autonomously by
   merely assigning a model; use the H2/H3 review gates from the blueprint.

### Production promotion workflow (must be executed before enabling)
- Confirm documented free model access with actual account credential
  under provider's active Free plan; no billing method or purchase.
- Verify model terms, licensing, commercial use, data residency, data
  retention and output obligations on the date of activation.
- Run sandbox-only golden datasets in `pt-BR`, `en`, `es` and compare
  quality, hallucination, safety, latency, schema adherence and failures.
- Exercise `429`, `403 plan_blocked`, `404 model_removed`, timeouts,
  malformed outputs and system quota depletion; **no paid fallback**.
- For TTS: test Brazilian Portuguese pronunciation with public domain text,
  consent/voice policies, audible quality, streaming/device fallback and
  zero-cost usage on the exact model.
- For Safeguard: measure false positives/negatives with adversarial samples
  and ensure classification alone cannot run tools or restrict users.
- Promote via registry version + approved task route + canary + explicit
  rollback; confirm customer data and cross-tenant boundaries untouched.

## Recommended order of impact
1. Safety second-opinion classifier: future Connect and NestLocal autonomous
   workflows (do **not** call on every message by default; quota-aware).
2. Voice-out: optional public content narration, especially NestLume,
   implemented using free-tier synthetic/public data and accessibility
   alternative when unsupported.
3. Qwen 3.8 multimodal vs Cloudflare Gemma 4: benchmark Portuguese OCR only
   for P0/P1 synthetic documents; never divert NestFinance/NestJourney P3.
4. Model quality arbitrage: route low-complexity workloads to inexpensive
   existing free models while preserving strict privacy and quota; model
   selection must remain server-controlled and regression-tested.

## Providers **not** recommended for regular production in FREE_ONLY
- Cerebras developer: one-off promotional credit with payment method and
  limited validity, not an enduring free production pool.
  https://www.cerebras.ai/pricing
- Hugging Face Inference Providers: approximately $0.10/month of Free
  credits is useful for tests but insufficient for a production fallback.
  https://huggingface.co/docs/inference-providers/pricing

## Remaining original definition-of-done blockers
Nothing in this research replaces F2 authenticated per-app E2E, F7 Mission
Control editing, F10 provider-backed evaluation, F11 tenant-secured RAG,
F12 async/media/DLQ end-to-end, F13 direct-provider cutover and F14
security/recovery/soak testing. Keep those PARTIAL until real evidence exists.
