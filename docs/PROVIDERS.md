# Provider Registry Review

Last reviewed: 2026-10-06

## Groq
Primary free provider for text, reasoning, structured output and transcription. GPT-OSS 120B and 20B remain Production models. Free limits observed at review: 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD. Whisper V3/V3 Turbo: 20 RPM, 2,000 RPD and 28,800 audio seconds/day. Limits belong to registry/config, never consuming apps.

## Cloudflare Workers AI
Complementary provider for multimodal, embeddings and safe fallback. Free allocation reviewed: 10,000 neurons/day. On Workers Free, exhaustion fails rather than automatically billing. Models requiring paid billing must be marked freeEligible=false.

## Gemini Free
Restricted to P0/public and explicitly approved non-sensitive workloads. Free Tier documentation states submitted data may be used to improve products; therefore P2/P3 are blocked by default.

## Mistral
Laboratory/controlled fallback until exact production task/model/terms are reviewed.

Paid adapters may exist only disabled. No provider failure may weaken privacy classification.
