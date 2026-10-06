# NestAI Blueprint Implementation Matrix

Canonical source: `NestAI_MillionsNest_AI_Platform_Blueprint_v1.0_2026-10-06.docx`.

Status meanings:
- **DONE**: implemented, tested and (when runtime-facing) deployed/verified.
- **PARTIAL**: architecture or primitives exist, but the blueprint requirement is not fully satisfied.
- **NOT STARTED**: material implementation is still missing.
- **FUTURE**: explicitly marked future/non-MVP by the blueprint.

This matrix is a release-control artifact. A phase is not complete merely because code compiles.

## Roadmap phases (Blueprint §61)

| Phase | Blueprint scope | Status | Evidence / remaining work |
| --- | --- | --- | --- |
| F0 Canonical specification | blueprint, ADRs, naming, taxonomy, contracts | PARTIAL | Blueprint condensed in repo; ADR coverage incomplete; full source preservation pending. |
| F1 Bootstrap | TS, pnpm, lint, tests, Actions, environments, domain, Worker, console shell | PARTIAL | Worker/CI/domain config exist; rendered console shell is missing. |
| F2 Auth foundation | NestAI token, verification, App Check, app identity, org, capabilities, RBAC negatives | PARTIAL | Hub ES256/JWKS + tenant/app/capability and cross-tenant tests are live; Firebase App Check and server-to-server auth remain. |
| F3 Provider adapters | Groq, Workers AI, Gemini, Mistral, streaming, structured output, provider health | PARTIAL | Groq + Workers AI exist. Gemini/Mistral, stream contract, structured output validation and provider health/circuit state remain. |
| F4 Router + Policy | task/provider/model registries, routes, sensitivity, free eligibility, fallback | PARTIAL | Task/Model/Policy/router exist; Provider Registry, versioned routes, richer ranking/fallback/circuit logic remain. |
| F5 ZERO COST | quotas, headroom, conserve, kill switches, paid hard lock, usage | PARTIAL | FREE_ONLY hard lock, D1 usage and burst rate limit exist; quota headroom/conserve/per-app/task kill switches and exhaustion simulation remain. |
| F6 Observability | logs, metrics, traces, waterfall, provider health, alerts | PARTIAL | metadata-only trace exists; metrics, waterfall, OTEL, alerting and provider health dashboards remain. |
| F7 Console premium | Overview, Apps, Tasks, Router, Providers, Prompts, Usage, Policies, Audit | NOT STARTED | UX/data contracts only; rendered React/Vite/Tailwind console is missing. |
| F8 SDK | @millionsnest/ai run/stream/transcribe/vision/jobs/errors/auth | PARTIAL | thin run client exists; package publication and remaining APIs/errors/auth helpers remain. |
| F9 Auto onboarding | manifest, validation, workflow, app registry, template | PARTIAL | in-code manifests exist; millionsnest.app.json, CI registration and repo template remain. |
| F10 Evals | datasets, runner, dashboard, regression, comparison, prompt promotion | PARTIAL | releaseGate primitive exists; golden datasets/runner/dashboard/model+prompt promotion remain. |
| F11 RAG | Vectorize, R2, ingest, evidence refs, auth filters | PARTIAL | tenant/sensitivity filtering primitives exist; Vectorize/R2/ingest/evidenceRefs/authorization pipeline remain. |
| F12 Jobs/media | Queues, audio, vision, image, batch | PARTIAL | bounded job envelope exists; Cloudflare Queues and media execution pipelines remain. |
| F13 App migration | Hub, Connect, NestLocal, MusicScale, NestFinance, NestJourney, NestAffiliate, NestLume | PARTIAL | Hub auth integration is live; consuming apps are not yet migrated to @millionsnest/ai and old provider-specific paths have not been fully removed. |
| F14 Production hardening | load, chaos, red team, rate/quota simulation, rollback, incidents, DR | NOT STARTED | release gates/runbook seed exist; full hardening suite remains. |

## MVP technical acceptance (Blueprint §94)

| Requirement | Status |
| --- | --- |
| ai.millionsnest.com works | PARTIAL — custom domain attached; DNS/live smoke must pass |
| canonical auth validated | DONE |
| App Check validated | NOT STARTED |
| Groq adapter works | PARTIAL — adapter implemented; live key/provider smoke not yet certified |
| Workers AI adapter works | DONE for binding/deploy; authenticated live model call still needs certified smoke |
| Gemini restriction works | PARTIAL — policy concept exists; Gemini adapter/explicit restriction tests missing |
| Mistral adapter works | NOT STARTED |
| Task Registry | DONE |
| Model Registry | DONE |
| Policy Engine | DONE |
| deterministic routing | DONE |
| streaming | NOT STARTED |
| structured output validation | NOT STARTED |
| circuit breaker | NOT STARTED |
| safe fallback | PARTIAL |
| quota | PARTIAL |
| FREE_ONLY hard lock | DONE |
| private-payload-free logs | DONE at application trace layer |
| console health/usage | NOT STARTED |
| SDK works | PARTIAL |
| app demo without provider key | PARTIAL — test SDK exists; real ecosystem app demo pending |
| cross-tenant negative tests | DONE |
| CI/CD passes | DONE for current runtime release |

## Experience acceptance (Blueprint §95)

Rendered premium console, responsive behavior, PT/EN/ES UI, WCAG AA, visual router, provider status, quota UX, explanatory errors, critical confirmations and guided empty states are **NOT YET COMPLETE**.

## Automatic integration acceptance (Blueprint §96)

The current SDK/app registry is only a foundation. The following remain required:
- publish/install `@millionsnest/ai`;
- `millionsnest.app.json` manifest;
- CI auto-registration;
- reusable app template;
- authorized/unauthorized task contract tests from a real app repo;
- proof that model changes do not require app deploy.

## Definition of Done (Blueprint §97)

NestAI is **NOT YET DEFINITION-OF-DONE**. The project remains in active implementation until security + architecture + real behavior + premium UX + mobile + i18n + accessibility + tests + observability + evidence are all approved.

## Explicit future items

Blueprint §§89–93 are future-ready architecture, not current MVP blockers:
- local/on-device AI;
- voice agents;
- customer-specific knowledge productization beyond current RAG foundation;
- paid AI entitlements;
- paid-tier quality SLAs.

They must remain architecturally possible without forcing paid dependencies into the initial release.
