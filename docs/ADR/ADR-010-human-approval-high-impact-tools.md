# ADR-010 — High-impact tools require deterministic approval

Status: Accepted  
Date: 2026-10-06

## Decision
LLMs may propose actions, but write/critical tool execution is capability-scoped, schema-validated and approval-gated.

## Consequences
Money, permissions, irreversible changes and other deterministic business truth are never delegated to model output. Global write kill switches remain available.
