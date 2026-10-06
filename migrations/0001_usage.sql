CREATE TABLE IF NOT EXISTS daily_usage (
  day TEXT NOT NULL,
  organization_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  provider_calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, organization_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_daily_usage_day ON daily_usage(day);
