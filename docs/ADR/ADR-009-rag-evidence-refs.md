# ADR-009 — RAG answers expose EvidenceRefs

Status: Accepted  
Date: 2026-10-06

## Decision
Knowledge retrieval is tenant/app/locale/sensitivity scoped and generated answers return explicit EvidenceRefs.

## Consequences
Retrieved content is treated as untrusted data, never as system instruction. Authorization filtering happens before generation and preferably during retrieval through metadata filters.
