CREATE TABLE IF NOT EXISTS cp_app_manifests (
  app_id TEXT PRIMARY KEY,
  repository TEXT NOT NULL,
  manifest_version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  registration_source TEXT NOT NULL,
  source_ref TEXT,
  source_sha TEXT,
  registered_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cp_app_manifests_repository
  ON cp_app_manifests(repository);
