CREATE TABLE IF NOT EXISTS request_traces (
  trace_id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  task TEXT NOT NULL,
  app_id TEXT NOT NULL,
  organization_hash TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  prompt_version INTEGER,
  duration_ms INTEGER,
  ttft_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  fallback_used INTEGER,
  retries INTEGER,
  cached INTEGER,
  output_validation TEXT,
  tool_usage INTEGER,
  outcome TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_request_traces_day ON request_traces(day, created_at);
CREATE INDEX IF NOT EXISTS idx_request_traces_provider ON request_traces(provider, created_at);
CREATE INDEX IF NOT EXISTS idx_request_traces_task ON request_traces(task, created_at);

CREATE TABLE IF NOT EXISTS provider_runtime_samples (
  sample_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  success INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  error_code TEXT,
  circuit_state TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_provider_samples_provider ON provider_runtime_samples(provider_id, created_at);

CREATE TABLE IF NOT EXISTS cp_alerts (
  alert_id TEXT PRIMARY KEY,
  alert_key TEXT NOT NULL UNIQUE,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_cp_alerts_status ON cp_alerts(status, last_seen_at);
