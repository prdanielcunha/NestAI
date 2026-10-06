# Security

## Non-negotiable invariants
- Tenant identity comes from trusted authorization, never client organizationId alone.
- P4 Restricted never reaches an external LLM.
- P2/P3 payload logging is off by default.
- Provider keys are backend-only.
- Critical writes require deterministic validation and approval.
- FREE_ONLY cannot silently transition to paid execution.

Security regression suites must include cross-tenant, expired/forged token, invalid capability, prompt injection, secret leakage, unsafe tool calls, privacy-route violations and paid calls in FREE_ONLY.
