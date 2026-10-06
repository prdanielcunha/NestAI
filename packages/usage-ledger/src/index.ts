export interface D1Result<T = unknown> { results?: T[] }
export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<D1Result>;
}
export interface D1DatabaseLike { prepare(query: string): D1Statement }

export type UsageRow = { requests: number; provider_calls: number };

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
