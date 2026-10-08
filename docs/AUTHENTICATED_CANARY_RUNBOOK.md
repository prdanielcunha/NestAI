# NestAI — Authenticated app canary (safe, one app per run)

Purpose: close the gap between **source-level SDK integration** and an
**authenticated live backend test**. This tool deliberately does **not**
claim full end-user UI/E2E certification.

- Script: `scripts/certify-authenticated-app.mjs`
- Unit tests: `tests/certify-authenticated-app.nodecheck.mjs`
- Current application matrix: Hub, Connect, NestLocal, NestJourney,
  NestFinance, MusicScale, NestAffiliate, NestLume.
- All payloads are **synthetic**. One provider request maximum per invocation,
  plus three rejection tests that must fail authentication before any provider
  is called.
- No customer records are written, read, or emitted in reports. Runtime
  monitoring/usage accounting may be incremented by a successful AI call.
- Does not use, provision or fall back to paid models: the live API must
  return `meta.providerClass=free`, and FREE_ONLY is checked separately in
  public readiness.
- Results deliberately never include provider-generated content, JWTs,
  App Check tokens, organization identifiers or credentials.
- No long-lived credentials should be stored in code, Git, artifacts,
  screenshots, issue comments or chat.

## Execution prerequisites — not available automatically

This tool needs a **short-lived legitimate NestAI access token** minted
by the Hub for the chosen application and organization, and its bound
Firebase App Check token. Use an authorized test account and a synthetic
test tenant. The tokens should be injected by a protected execution
environment immediately before the run. Never paste them in chat.

Run the script in a terminal/session that already has the following
temporary environment variables securely injected:
- `NESTAI_CANARY_APP_ID`: one of the eight canonical app identifiers
- `NESTAI_CANARY_ORG_ID`: authorized test tenant (Hub: `global`)
- `NESTAI_CANARY_ACCESS_TOKEN`: short-lived Hub-minted NestAI JWT
- `NESTAI_CANARY_APP_CHECK_TOKEN`: bound Firebase App Check JWT

Then execute `node scripts/certify-authenticated-app.mjs` once per
app/token pair. The process returns nonzero if any security negative
or positive inference fails.

Expected sequence:
1. missing Authorization must return 401 `AUTH_MISSING_BEARER`.
2. wrong app header must return 401 `AUTH_APP_HEADER_MISMATCH`.
3. wrong organization must return 401 `AUTH_TENANT_MISMATCH`.
4. allowed synthetic `/v1/run` must return 200, the matching task,
   a result and `meta.providerClass: free` and `cached: false`.

This verifies **NestAI and Hub token/auth/compute boundary for a single
backend path**, not whether the consuming app has deployed the SDK or
that its screen, permissions, onboarding and workflow behave correctly.

## Completion gate

For each app record: run metadata, task, four outcomes, provider
availability, locale, and next action without tokens/customer content.
After each of the eight passes, carry out app UI tests with a user
session, App Check, real free provider routing, normal error handling
and rollback. This must be executed by a deployment environment with
authorized, ephemeral credentials, not by unauthenticated monitoring.
Missing credentials are **BLOCKED**, never a passing result.
