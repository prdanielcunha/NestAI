# ADR-005 — Cloudflare AI Gateway is a lower layer

Status: Accepted  
Date: 2026-10-06

## Decision
AI Gateway may provide transport-level capabilities, but it is not the product policy authority.

## Consequences
NestAI remains responsible for task authorization, sensitivity, provider eligibility, quota, fallback, output validation and audit. Payload logging is disabled by default for private traffic. Apps do not configure AI Gateway directly.
