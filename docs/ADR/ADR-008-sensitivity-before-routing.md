# ADR-008 — Data sensitivity is evaluated before routing

Status: Accepted  
Date: 2026-10-06

## Decision
Privacy classification and minimization precede provider/model selection.

## Consequences
P4 never leaves the controlled environment. P2/P3 cannot fall back to a provider whose policy ceiling is lower. Cost or availability can never override privacy.
