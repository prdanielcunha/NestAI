# NestAI — MillionsNest Intelligence Platform

Central AI infrastructure for the MillionsNest ecosystem.

## Status
Bootstrap in progress. The repository starts in **FREE_ONLY** mode: paid fallback and automatic provider upgrades are prohibited.

## Core rule
Applications request canonical tasks; they never choose provider/model IDs and never receive provider API keys.

```ts
import { ai } from "@millionsnest/ai";
const result = await ai.run("newapp.some.task", input);
```

Canonical architecture: `docs/NESTAI_MASTER_BLUEPRINT.md`.
