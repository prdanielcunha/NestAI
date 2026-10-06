# ADR-011 — Auto-onboarding uses app manifests and workload identity

Status: Accepted  
Date: 2026-10-06

## Decision
MillionsNest apps declare AI intent in `millionsnest.app.json` and register through GitHub Actions OIDC.

## Consequences
No provider secret is copied to app repositories. Registration is attributable to repository/ref/SHA, validated against the canonical owner and task namespace.
