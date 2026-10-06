CREATE TABLE IF NOT EXISTS idempotency_records (
  organization_id_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  result_json TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  PRIMARY KEY (organization_id_hash, app_id, task_id, idempotency_key_hash)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expiry ON idempotency_records(expires_at);
