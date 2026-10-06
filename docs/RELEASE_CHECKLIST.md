# NestAI release readiness

A release is eligible for `production` only when every item below is true.

## Automated gates
- [ ] CI succeeds on the exact `main` SHA.
- [ ] lint succeeds.
- [ ] strict TypeScript succeeds.
- [ ] general tests succeed.
- [ ] security tests succeed.
- [ ] Cloudflare Wrangler dry-run succeeds.
- [ ] `FREE_ONLY` boot invariants succeed.
- [ ] privacy tests prove P4 external blocking.
- [ ] tenant/auth tests prove cross-tenant rejection.
- [ ] router tests prove no privacy-violating fallback.

## Cloudflare account gates
- [ ] A real D1 database named `nestai` exists.
- [ ] `wrangler.jsonc` contains its real database ID, never the placeholder UUID.
- [ ] D1 migrations have been applied.
- [ ] Worker secret `HUB_TOKEN_PUBLIC_JWK` exists.
- [ ] GitHub production environment contains `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
- [ ] Optional `GROQ_API_KEY` is configured only if Groq routing is desired.
- [ ] Hub issuer and audience values match the real Hub token issuer.
- [ ] Custom domain is attached only after the Worker health check succeeds.

## Live verification
- [ ] GET /health returns 200.
- [ ] Unauthenticated POST /v1/run returns 401.
- [ ] Valid tenant token can execute an allowed task.
- [ ] Cross-tenant token is rejected.
- [ ] P4 payload is rejected before provider execution.
- [ ] D1 daily usage increments after a provider call.
- [ ] Rate limit returns 429 when exceeded.
- [ ] No prompt/output content is written to application traces.

Never mark a release deployed while any Cloudflare account gate or live verification item is unknown.
