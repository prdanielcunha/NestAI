# @millionsnest/ai

Official client SDK for NestAI — MillionsNest Intelligence Platform.

The SDK calls the canonical endpoint `https://ai.millionsnest.com/v1`. Consuming apps request canonical tasks and never select or receive provider credentials.

## Main APIs

- `run()`
- `stream()`
- `transcribe()`
- `vision()`
- `embeddings()`
- `image()`
- `createJob()`
- `getJob()`

Authentication is delegated to the MillionsNest Hub/Firebase integration through short-lived NestAI tokens and Firebase App Check.

Provider/model selection, privacy, quota, fallback and output validation remain server-side in NestAI.
