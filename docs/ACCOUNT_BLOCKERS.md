# Remaining account-level gates

These are external-account facts that cannot be proven from repository source alone. Secrets are intentionally unreadable.

## Confirmed by repository configuration

- D1 has a concrete production database ID in `wrangler.jsonc`.
- KV, Queues and Vectorize bindings are present.
- `ai.millionsnest.com` is configured as the canonical custom domain.
- GitHub deployment workflows are wired to Cloudflare account secrets.
- R2 account activation was confirmed by the project owner on 2026-10-07.

## Pending live/account verification

1. **R2 reprovision after activation**
   - Run the storage provisioning workflow after merging the guarded R2 changes.
   - Confirm bucket `nestai-knowledge` exists as **Standard**.
   - Confirm the `KNOWLEDGE_BUCKET` binding and lifecycle rules.
   - Confirm `AI_R2_WRITES_ENABLED=true` only after successful provisioning.
   - Run a guarded write/read/delete/reconciliation smoke.

2. **External AI provider credentials**
   - `GROQ_API_KEY`: manual key creation is required; repository cannot inspect whether it exists.
   - `GEMINI_API_KEY`: manual key creation is required; repository cannot inspect whether it exists.
   - `MISTRAL_API_KEY`: manual key creation is required and Free mode/pay-as-you-go state must be confirmed before enabling production routing.

3. **Hub/auth live proof**
   - Confirm short-lived ES256 Hub tokens against the production JWKS endpoint.
   - Run valid, denied and cross-tenant calls from every consuming app.
   - Complete service-to-service proof for jobs/webhooks.

4. **Consumer cutover**
   - Install the released `@millionsnest/ai` SDK in each consumer.
   - Replace direct provider calls behind feature flags.
   - Remove old provider secrets from consumers only after successful cutover/rollback testing.

No item above may be represented as completed without live evidence.
