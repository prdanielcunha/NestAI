CREATE TABLE IF NOT EXISTS cp_apps (
  app_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_locale TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  manifest_version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_tasks (
  task_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  modality TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  streaming INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_task_versions (
  task_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (task_id, version)
);

CREATE TABLE IF NOT EXISTS cp_providers (
  provider_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  free_eligible INTEGER NOT NULL,
  max_sensitivity TEXT NOT NULL,
  terms_reviewed_at TEXT,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_models (
  model_id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  provider_model_id TEXT NOT NULL,
  status TEXT NOT NULL,
  free_eligible INTEGER NOT NULL,
  paid_required INTEGER NOT NULL,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_routes (
  route_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_route_versions (
  route_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (route_id, version)
);

CREATE TABLE IF NOT EXISTS cp_prompts (
  prompt_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  current_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_prompt_versions (
  prompt_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (prompt_id, version)
);

CREATE TABLE IF NOT EXISTS cp_policies (
  policy_id TEXT PRIMARY KEY,
  current_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_policy_versions (
  policy_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  config_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (policy_id, version)
);

CREATE TABLE IF NOT EXISTS cp_quotas (
  quota_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  provider TEXT,
  config_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_provider_health (
  provider_id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  success_rate REAL,
  p50_ms INTEGER,
  p95_ms INTEGER,
  circuit_state TEXT,
  checked_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_eval_suites (
  suite_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_eval_cases (
  case_id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  input_json TEXT NOT NULL,
  expected_json TEXT,
  sensitivity TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_eval_runs (
  run_id TEXT PRIMARY KEY,
  suite_id TEXT NOT NULL,
  target_json TEXT NOT NULL,
  score REAL,
  passed INTEGER NOT NULL,
  report_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_knowledge_sources (
  source_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  organization_id_hash TEXT NOT NULL,
  sensitivity TEXT NOT NULL,
  locale TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_knowledge_indexes (
  index_id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  chunks INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_jobs (
  job_id TEXT PRIMARY KEY,
  app_id TEXT NOT NULL,
  organization_id_hash TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 0,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_incidents (
  incident_id TEXT PRIMARY KEY,
  severity TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  provider_id TEXT,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  metadata_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_audit_events (
  event_id TEXT PRIMARY KEY,
  actor_hash TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  environment TEXT NOT NULL,
  metadata_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cp_audit_events_created ON cp_audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_cp_jobs_status ON cp_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_cp_eval_runs_suite ON cp_eval_runs(suite_id, created_at);
