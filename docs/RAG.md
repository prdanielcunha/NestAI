# RAG / Knowledge Layer

## Production pipeline

source → parser/normalizer → sensitivity → chunk → production embedding → app/tenant namespace → Vectorize → permission-filtered candidate retrieval → Prompt Guard on retrieved text → optional BGE reranker → final chunks → business model → structured output/evidenceRefs.

Authorization, tenant isolation and sensitivity filtering happen before the reranker. Reranking changes relevance only; it never changes visibility.

## Production embedding

Current production embedding remains `@cf/google/embeddinggemma-300m`. It is not replaced merely because a newer model exists.

## BGE-M3 candidate

`@cf/baai/bge-m3` is registered as a 1024-dimensional multilingual candidate. It must beat the production embedding on sanitized PT-BR/EN/ES datasets before promotion.

Required comparisons include:
- Recall@K
- MRR / nDCG where applicable
- final groundedness
- PT-BR, EN and ES relevance
- latency
- Workers AI consumption

Promotion follows candidate → benchmark → regression → shadow (when applicable) → canary → production.

## BGE Reranker

`@cf/baai/bge-reranker-base` reranks only candidates already authorized by Vectorize filters.

Runtime behavior:
1. retrieve a larger authorized candidate set;
2. run Prompt Guard over retrieved text;
3. quarantine unsafe/uncertain external evidence;
4. rerank the remaining candidates;
5. select final top N;
6. if reranker fails/quota is unavailable, fall back to the original authorized vector order.

Kill switch: `AI_RAG_RERANK_ENABLED`.

Telemetry records reranker usage/fallback and will retain only metadata, never chunk payloads.

## Evidence

Grounded tasks must return evidence references that point to supplied/retrieved evidence. NestLume additionally validates that every claim references an evidence ID actually present in the request.

## R2 persistence

Knowledge-source persistence uses R2 Standard only. NestAI reserves only a conservative share of the published account-level free allowance and hard-locks before its own allocation edge. R2 is an optimization/persistence layer; critical app data remains in the application source of truth.
