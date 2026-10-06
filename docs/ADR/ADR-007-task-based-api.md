# ADR-007 — Apps request tasks, not models

Status: Accepted  
Date: 2026-10-06

## Decision
The public SDK exposes stable task identifiers. Provider/model selection is internal to NestAI.

## Consequences
Model deprecations, provider changes, fallback and quality policy can change centrally without requiring consuming-app releases.
