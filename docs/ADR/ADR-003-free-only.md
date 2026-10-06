# ADR-003 — FREE_ONLY is a boot invariant

Status: Accepted — 2026-10-06

Initial production must boot with `AI_BILLING_MODE=FREE_ONLY`, `ALLOW_PAID_FALLBACK=false`, `AUTO_UPGRADE_PROVIDER=false`, and `AI_PAID_ENABLED=false`. Unsafe combinations fail closed.
