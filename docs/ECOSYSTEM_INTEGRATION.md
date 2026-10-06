# App integration contract

All MillionsNest apps integrate through the thin SDK and Hub-issued short-lived tokens.

## Shared flow
1. User authenticates with the MillionsNest Hub.
2. App requests a NestAI token from Hub for its own `appId`, organization and capabilities.
3. App calls a canonical task through `NestAiClient`.
4. NestAI verifies tenant/app/capability, classifies privacy, applies quota/rate policy and selects the provider.
5. The app receives task output plus trace ID; it never receives provider credentials.

## Initial task mapping

| App | Task | Sensitivity floor | Notes |
| --- | --- | --- | --- |
| MillionsNest Connect | `connect.reply.suggest` | P2 | reply drafting; no automatic send |
| NestFinance | `finance.receipt.extract` | P3 | extraction only; deterministic finance domain remains authoritative |
| NestLume | `nestlume.study.answer` | P1 | study assistance; RAG sources remain tenant/app scoped |
| NestAffiliate | `affiliate.pin.copy` | P0 | public marketing copy |

## Safety
LLM output cannot directly change billing, permissions, financial truth, membership or irreversible domain records. Any future write tool requires an explicit capability and a deterministic application-side validator.
