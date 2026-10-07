# Provider Registry Review

Last reviewed: 2026-10-07

## Runtime strategy

NestAI is multi-provider by design. Consuming apps call canonical tasks; they never choose a provider or carry provider secrets. Routing must preserve privacy first, then capability, free eligibility, health, quality, latency and quota.

## Cloudflare Workers AI

**Account setup:** already part of the Cloudflare Worker through the `AI` binding; no separate model API key is required in consuming apps.

Primary privacy-preserving provider for P3-eligible workloads, multimodal extraction, embeddings, image generation, transcription and safe fallback. Workers AI free capacity remains controlled by the NestAI quota engine. Any model requiring paid billing must remain `freeEligible=false`.

## Groq

**Manual account step required once:** create a Groq API key and store it as the Worker secret `GROQ_API_KEY`. The repository cannot read or prove secret values by design.

Primary external free provider for text, reasoning, structured output and transcription. Current reviewed Free Plan limits for GPT-OSS 120B/20B are 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD. Whisper V3/V3 Turbo: 20 RPM, 2,000 RPD and 28,800 audio seconds/day. Limits remain registry/config values and must be reviewed periodically.

## Gemini Free

**Manual account step required once:** create a Gemini API key and store it as the Worker secret `GEMINI_API_KEY`.

Production candidate is `gemini-3.5-flash-lite` (GA). It is enabled only for explicitly whitelisted P0/non-sensitive tasks. Gemini Free Tier data may be used to improve Google products, therefore P2/P3/P4 never route to Gemini Free. The previous `gemini-2.5-flash-lite` entry remains blocked to avoid new-project availability issues.

## Mistral Free mode

**Manual account step required once:** create a Mistral Studio API key and store it as `MISTRAL_API_KEY`. Free mode itself does not require a credit card, but the key follows the Organization/Workspace plan and pay-as-you-go settings.

The adapter and Mistral Small 4 (`mistral-small-2603`) remain laboratory-only in `FREE_ONLY`. Before production routing, confirm in the Mistral account that:
- the workspace is in Free mode;
- pay-as-you-go is disabled;
- the included monthly usage/limits are known;
- the production key belongs to that guarded workspace.

Until that account state is verifiable, `freeEligible=false` is intentional.

## Paid providers

Adapters may exist disabled, but no paid provider or pay-as-you-go fallback may execute while `AI_BILLING_MODE=FREE_ONLY`. No provider failure may weaken privacy classification or silently enable billing.
