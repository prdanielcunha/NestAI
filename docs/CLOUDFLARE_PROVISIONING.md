# Cloudflare provisioning

This repository is prepared for Cloudflare Workers but intentionally does not pretend account resources exist.

## Required resources
1. Worker: `nestai`
2. Workers AI binding: `AI`
3. AI Gateway: `default` (may be auto-created by first authenticated Workers AI request)
4. D1 database: `nestai`
5. Rate Limiting binding: `AI_RATE_LIMITER`
6. Later phases: Vectorize index, R2 bucket and Queue only when their concrete integrations land.

## Required GitHub production secrets
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## Required Worker secrets
- `HUB_TOKEN_PUBLIC_JWK`
- `GROQ_API_KEY` only if Groq is enabled.

## Provision D1
Create the D1 database, replace the placeholder `database_id` in `wrangler.jsonc`, then apply:
`pnpm wrangler d1 migrations apply nestai --remote`

The placeholder UUID must never be used in a production release.

## Hub signing contract
The MillionsNest Hub signs short-lived ES256 JWTs. NestAI stores only the public JWK and verifies issuer, audience, expiry, tenant, app and capability.

No provider key belongs in any consuming app.
