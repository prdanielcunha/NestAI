# Security

## Non-negotiable invariants

- Tenant identity comes from trusted authorization, never client `organizationId` alone.
- Hub remains identity, organization, membership, entitlement and RBAC authority.
- Provider keys are backend-only; consumer apps never receive Groq/Gemini/Mistral/NVIDIA secrets.
- P4 Restricted never reaches an external AI provider.
- P3 tasks use only providers explicitly approved for P3; current finance/vision paths are Cloudflare-only.
- Gemini Free and NVIDIA NIM never receive P2/P3/P4.
- NVIDIA NIM is Evaluation Lab only and cannot be selected by customer routing.
- Critical domain writes remain deterministic/human-authorized.
- FREE_ONLY cannot silently transition to paid execution.

## Request security pipeline

Authenticate → tenant/entitlement → task/capability policy → sensitivity classification → privacy minimization/redaction → prompt-injection detection when eligible → provider filtering → quota/cost guard → route → retrieval → retrieved-content safety → rerank → final context → model → structured/evidence validation → metadata-only telemetry.

## Prompt Guard

`meta-llama/llama-prompt-guard-2-86m` is defense-in-depth, not an authorization authority.

Rules:
- the deterministic injection detector runs first;
- P3/P4 are not sent to Groq Prompt Guard;
- ordinary user input falls back to deterministic policy if the classifier is unavailable;
- untrusted retrieved RAG content fails closed/quarantines on an uncertain classifier result;
- a malicious/uncertain verdict is interpreted by Policy Engine;
- Prompt Guard never grants tool/write permission.

## RAG trust boundary

All retrieved documents are untrusted data. They never become system/developer instructions. Tenant/app/sensitivity filters constrain retrieval before reranking; the reranker cannot expand authorization.

## Local/P4 boundary

`local-webgpu` is the only provider class that may be eligible for P4. If the required local capability is unavailable or fails, P4 has no remote fallback.

## Secrets and logs

Secrets are Cloudflare Worker secrets or provider bindings. Runtime logs/events store metadata only; provider response bodies, raw prompts, private documents and secrets must not be logged. Provider probes return normalized states/codes and never raw provider error bodies.

## Regression requirements

Security suites cover forged/expired tokens, capability mismatch, cross-tenant access, privacy-route violations, prompt injection/jailbreak, safe Prompt Guard degradation, NVIDIA customer-traffic denial, P4 local-only behavior, schema/evidence validation, secret leakage and paid execution attempts.
