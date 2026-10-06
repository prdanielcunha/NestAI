# ADR-004 — Cloudflare Workers as NestAI runtime

Status: Accepted  
Date: 2026-10-06

## Decision
NestAI runs its Edge API and Mission Control delivery on Cloudflare Workers.

## Why
The blueprint requires a low-latency policy gateway, Workers AI binding, D1/KV/Queues/Vectorize/R2 integration and a strict free-first operating mode.

## Consequences
- Apps call the canonical NestAI endpoint, never provider endpoints directly.
- Runtime-specific bindings remain behind NestAI interfaces.
- A provider/runtime outage must degrade AI features, not deterministic app behavior.
