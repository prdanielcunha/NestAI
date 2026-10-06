# Task Registry

Apps request stable task IDs, never model IDs. Each task defines purpose, owner, app, input/output schema, privacy, providers, fallback, streaming, timeout, cache, tools, approval, eval suite and prompt version.

Initial seed tasks are in `packages/task-registry`; expansion happens with app migrations and golden datasets.
