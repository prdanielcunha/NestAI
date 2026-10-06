# NestAI — MillionsNest Intelligence Platform

**Current Architecture Version:** 1.2-core-runtime  
**Last Updated:** 2026-10-06  
**Production SHA:** NOT DEPLOYED  
**Main SHA:** see Git history (updated automatically after release tooling lands)  
**Production Status:** NOT DEPLOYED  
**Last Architecture Review:** 2026-10-06  
**Last Provider Review:** 2026-10-06

> This is the live repository source of truth. The complete v1.0 source specification was supplied in the MillionsNest AI Platform project on 2026-10-06. During bootstrap this file records implemented reality plus canonical invariants; no unimplemented feature is represented as deployed.

## Implemented reality

- Canonical repository: `prdanielcunha/NestAI` (existing repository preserved).
- TypeScript/pnpm monorepo bootstrap.
- Canonical contracts for sensitivity and billing mode.
- Task-based registry seed.
- Model registry seed.
- Privacy Firewall with P0-P4 escalation and P4 external blocking.
- FREE_ONLY boot invariants and tested Cost Guard.
- ES256 short-lived Hub token verification, tenant/app binding and capability checks.
- Deterministic privacy-first semantic router with runtime provider readiness.
- Groq and Cloudflare Workers AI provider adapters.
- Cloudflare Worker API with /health and /v1/run.
- Cloudflare native tenant/user rate limiting.
- D1 daily usage ledger and migration for provider quotas.
- Metadata-only hashed observability traces.
- Thin ecosystem SDK.
- CI quality/security gates plus Wrangler deployment dry-run.
- Gated production deployment workflow and branch-sync verifier.
- Architecture/security/privacy/provider/task/RAG/runbook/release documentation.

## Not yet production claims

Worker runtime, auth, routing, provider adapters, D1 ledger and SDK are implemented but **not yet live-deployed**. A real Cloudflare D1 database ID, Worker secrets, Cloudflare deployment credentials, migrations, custom domain, App Check, RAG/Vectorize/R2/Queues, console, SDK publication and live provider smoke tests remain unverified. The placeholder D1 UUID in `wrangler.jsonc` must never be represented as provisioned.

## Canonical invariants

1. Hub remains authority for identity, organization, membership, entitlement, billing, RBAC and capabilities.
2. Apps request tasks; apps never select models/providers.
3. Privacy classification and minimization happen before routing.
4. P4 Restricted never leaves the controlled environment.
5. P2/P3 payload logging is disabled by default.
6. FREE_ONLY forbids paid fallback, automatic upgrade and paid execution.
7. Tenant isolation applies to RAG, cache, logs, quotas, storage, metadata and tools.
8. LLM output is never authoritative for money, permissions, irreversible writes or other deterministic domain truth.
9. Production prompts/routes/policies/models are versioned, evaluated and rollback-capable.
10. AI failure must not disable deterministic product functionality.

## Target architecture

MillionsNest Apps → `@millionsnest/ai` → NestAI Edge API → Auth/Tenant → Privacy Firewall → Policy Engine → deterministic Semantic Router → AI Gateway/provider adapters.

Control plane target: D1 + KV. Knowledge target: Vectorize + R2. Background target: Queues. Runtime target: Cloudflare Workers. Console target remains a premium responsive Intelligence Mission Control with PT-BR/en/es and WCAG AA.

## Provider review — 2026-10-06

Groq GPT-OSS 120B/20B remain Production models and Free Plan limits were reconfirmed. Cloudflare Workers AI still provides 10,000 free neurons/day and Free-plan exhaustion fails instead of silently charging. Gemini Free remains restricted because its Free Tier data-use policy allows use to improve products. Exact provider facts are configuration and must be re-reviewed, not hard-coded into consuming apps.

## CHANGELOG ARQUITETURAL

### 2026-10-06 — Architecture 1.1-bootstrap
- **Decision:** Preserve existing repository name `NestAI` instead of creating the earlier proposed `millionsnest-ai` repository.
- **Reason:** repository already exists and the owner explicitly designated it canonical.
- **Impact:** documentation/release automation uses `prdanielcunha/NestAI`; package remains `@millionsnest/ai`.
- **Files:** README, ADR-002, this blueprint.
- **Migration:** none.
- **Production:** not deployed.

### 2026-10-06 — FREE_ONLY as executable invariant
- **Decision:** unsafe billing flags fail closed rather than merely documenting the policy.
- **Reason:** prevents accidental paid fallback as implementation grows.
- **Impact:** startup/config validation and security tests.
- **Files:** policy engine, env example, security tests, ADR-003.
- **Migration:** none.
- **Production:** not deployed.

### 2026-10-06 — Architecture 1.2 core runtime
- **Decision:** implement the secure execution path before console/RAG expansion.
- **Reason:** prove auth, tenant isolation, privacy, free-only routing and provider boundaries before adding product surface area.
- **Impact:** Worker API, Hub token verifier, Privacy Firewall, router, provider adapters, D1 ledger, Cost Guard, observability, SDK and release gates.
- **Migration:** D1 migration `0001_usage.sql` is required once the real database is provisioned.
- **Production:** not deployed; Cloudflare account gates remain.

### 2026-10-06 — Provider snapshot refreshed
- **Decision:** retain Groq + Workers AI as initial base; keep Gemini Free restricted.
- **Reason:** official documentation review supports the original direction.
- **Impact:** model/provider registry and privacy policy.
- **Migration:** none.
- **Production:** not deployed.

## Implementation phases

F0 Specification → F1 Bootstrap → F2 Auth → F3 Providers → F4 Router/Policy → F5 Free Cost Guard → F6 Observability → F7 Console → F8 SDK → F9 Auto-onboarding → F10 Evals → F11 RAG → F12 Jobs/Media → F13 App integrations → F14 Production hardening.

A phase is complete only with applicable code, tests, security, UX/mobile/i18n, docs, observability, deployment and real verification.
