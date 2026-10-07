export interface D1Result<T = unknown> {
  results?: T[];
  meta?: { changes?: number; changed_db?: boolean };
}
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1DatabaseLike { prepare(query: string): D1Statement }

export type UsageRow = { requests: number; provider_calls: number };
export type UsageScopeType = "provider" | "app" | "organization" | "user";
export type UsageDimension = {
  scopeType: UsageScopeType;
  scopeId: string;
  provider: string;
  task?: string;
};

function utcDay(now = new Date()): string { return now.toISOString().slice(0, 10); }

export async function getUsage(db: D1DatabaseLike, organizationId: string, provider: string, now = new Date()): Promise<UsageRow> {
  const row = await db.prepare(
    "SELECT requests, provider_calls FROM daily_usage WHERE day = ?1 AND organization_id = ?2 AND provider = ?3"
  ).bind(utcDay(now), organizationId, provider).first<UsageRow>();
  return row ?? { requests: 0, provider_calls: 0 };
}

export async function incrementUsage(db: D1DatabaseLike, organizationId: string, provider: string, now = new Date()): Promise<void> {
  await db.prepare(
    `INSERT INTO daily_usage(day, organization_id, provider, requests, provider_calls)
     VALUES (?1, ?2, ?3, 1, 1)
     ON CONFLICT(day, organization_id, provider)
     DO UPDATE SET requests = requests + 1, provider_calls = provider_calls + 1`
  ).bind(utcDay(now), organizationId, provider).run();
}

export async function getDimensionalUsage(
  db: D1DatabaseLike,
  dimension: UsageDimension,
  now = new Date(),
): Promise<UsageRow> {
  const row = await db.prepare(
    `SELECT requests, provider_calls
       FROM daily_usage_dimensions
      WHERE day = ?1
        AND scope_type = ?2
        AND scope_id = ?3
        AND provider = ?4
        AND task = ?5`
  ).bind(
    utcDay(now),
    dimension.scopeType,
    dimension.scopeId,
    dimension.provider,
    dimension.task ?? "*",
  ).first<UsageRow>();
  return row ?? { requests: 0, provider_calls: 0 };
}

export async function incrementDimensionalUsage(
  db: D1DatabaseLike,
  dimensions: UsageDimension[],
  now = new Date(),
): Promise<void> {
  const day = utcDay(now);
  for (const dimension of dimensions) {
    await db.prepare(
      `INSERT INTO daily_usage_dimensions(day, scope_type, scope_id, provider, task, requests, provider_calls)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, 1)
       ON CONFLICT(day, scope_type, scope_id, provider, task)
       DO UPDATE SET requests = requests + 1, provider_calls = provider_calls + 1`
    ).bind(
      day,
      dimension.scopeType,
      dimension.scopeId,
      dimension.provider,
      dimension.task ?? "*",
    ).run();
  }
}

export async function recordRuntimeEvent(
  db: D1DatabaseLike,
  event: {
    id: string;
    eventType: string;
    appId?: string;
    provider?: string;
    task?: string;
    organizationHash?: string;
  },
  now = new Date(),
): Promise<void> {
  await db.prepare(
    `INSERT INTO runtime_events(id, day, event_type, app_id, provider, task, organization_hash, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`
  ).bind(
    event.id,
    utcDay(now),
    event.eventType,
    event.appId ?? null,
    event.provider ?? null,
    event.task ?? null,
    event.organizationHash ?? null,
    now.toISOString(),
  ).run();
}

export async function countRuntimeEvents(
  db: D1DatabaseLike,
  eventType: string,
  now = new Date(),
): Promise<number> {
  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM runtime_events WHERE day = ?1 AND event_type = ?2"
  ).bind(utcDay(now), eventType).first<{ count: number }>();
  return Number(row?.count ?? 0);
}
