CREATE TABLE IF NOT EXISTS daily_usage_dimensions (
  day TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  task TEXT NOT NULL DEFAULT '*',
  requests INTEGER NOT NULL DEFAULT 0,
  provider_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, scope_type, scope_id, provider, task)
);

CREATE INDEX IF NOT EXISTS idx_daily_usage_dimensions_lookup
  ON daily_usage_dimensions(day, scope_type, scope_id, provider);

CREATE TABLE IF NOT EXISTS runtime_events (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  event_type TEXT NOT NULL,
  app_id TEXT,
  provider TEXT,
  task TEXT,
  organization_hash TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_runtime_events_day_type
  ON runtime_events(day, event_type);
