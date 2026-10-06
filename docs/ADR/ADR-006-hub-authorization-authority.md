# ADR-006 — MillionsNest Hub remains authorization authority

Status: Accepted  
Date: 2026-10-06

## Decision
NestAI does not create a parallel identity, membership, organization, billing or entitlement database.

The Hub issues short-lived ES256 tokens for NestAI. NestAI verifies signature, audience, issuer, tenant, app and capabilities. Firebase App Check binds user traffic to an approved app.

## Consequences
Authorization changes remain centralized in the Hub and NestAI avoids Firestore membership lookups on every inference.
