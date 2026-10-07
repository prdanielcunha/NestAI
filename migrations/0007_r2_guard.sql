CREATE TABLE IF NOT EXISTS r2_usage_monthly (
  month TEXT PRIMARY KEY,
  storage_bytes INTEGER NOT NULL DEFAULT 0,
  class_a_ops INTEGER NOT NULL DEFAULT 0,
  class_b_ops INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS r2_objects (
  object_key TEXT PRIMARY KEY,
  size_bytes INTEGER NOT NULL,
  category TEXT NOT NULL,
  expires_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_r2_objects_category ON r2_objects(category, updated_at);
CREATE INDEX IF NOT EXISTS idx_r2_objects_expiry ON r2_objects(expires_at);
