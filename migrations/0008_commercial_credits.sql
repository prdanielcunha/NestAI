-- NestAI commercial credit ledger. Dormant until Hub-signed entitlements are integrated.
-- Values are integer commercial credits (never tokens or real currency).
-- D1 batch() must wrap reserve/settle operations; triggers prevent partial reservations.
CREATE TABLE IF NOT EXISTS ai_credit_grants (
  grant_id TEXT PRIMARY KEY,
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('trial','plan','addon','legacy')),
  source_ref TEXT NOT NULL,
  grant_version INTEGER NOT NULL,
  total_credits INTEGER NOT NULL CHECK (total_credits > 0),
  reserved_credits INTEGER NOT NULL DEFAULT 0 CHECK (reserved_credits >= 0),
  consumed_credits INTEGER NOT NULL DEFAULT 0 CHECK (consumed_credits >= 0),
  begins_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (reserved_credits + consumed_credits <= total_credits),
  CHECK (begins_at < expires_at),
  UNIQUE (organization_hash, app_id, source, source_ref)
);
CREATE INDEX IF NOT EXISTS idx_ai_credit_grant_available
  ON ai_credit_grants (organization_hash, app_id, expires_at);

CREATE TABLE IF NOT EXISTS ai_credit_reservations (
  reservation_id TEXT PRIMARY KEY,
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idempotency_key_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  price_version INTEGER NOT NULL,
  max_charge INTEGER NOT NULL CHECK (max_charge > 0),
  actual_charge INTEGER NOT NULL DEFAULT 0 CHECK (actual_charge >= 0),
  state TEXT NOT NULL CHECK (state IN ('pending','reserved','settled','released')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  settled_at TEXT,
  CHECK (actual_charge <= max_charge),
  UNIQUE (organization_hash, app_id, task_id, idempotency_key_hash)
);
CREATE INDEX IF NOT EXISTS idx_ai_credit_reservation_stale
  ON ai_credit_reservations(state, expires_at);

CREATE TABLE IF NOT EXISTS ai_credit_allocations (
  reservation_id TEXT NOT NULL REFERENCES ai_credit_reservations(reservation_id),
  grant_id TEXT NOT NULL REFERENCES ai_credit_grants(grant_id),
  reserved_credits INTEGER NOT NULL CHECK (reserved_credits > 0),
  consumed_credits INTEGER NOT NULL DEFAULT 0 CHECK (consumed_credits >= 0),
  PRIMARY KEY (reservation_id, grant_id),
  CHECK (consumed_credits <= reserved_credits)
);

CREATE TABLE IF NOT EXISTS ai_credit_transactions (
  transaction_id TEXT PRIMARY KEY,
  reservation_id TEXT NOT NULL,
  grant_id TEXT NOT NULL,
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('reserve','settle','release')),
  reserved_delta INTEGER NOT NULL,
  consumed_delta INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_credit_transactions_scope
  ON ai_credit_transactions (organization_hash, app_id, created_at);

-- Commercial grant terms and credit events are immutable audit records.
-- Corrections must be new grants/adjustments with explicit origin, never rewrite history.
CREATE TRIGGER IF NOT EXISTS ai_credit_transactions_immutable_update
BEFORE UPDATE ON ai_credit_transactions
BEGIN SELECT RAISE(ABORT, 'AI_CREDIT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ai_credit_transactions_immutable_delete
BEFORE DELETE ON ai_credit_transactions
BEGIN SELECT RAISE(ABORT, 'AI_CREDIT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ai_credit_grant_terms_immutable
BEFORE UPDATE OF organization_hash,app_id,source,source_ref,grant_version,total_credits,begins_at,expires_at,created_at
ON ai_credit_grants
BEGIN SELECT RAISE(ABORT, 'AI_CREDIT_GRANT_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS ai_credit_allocation_guard
BEFORE INSERT ON ai_credit_allocations
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1 FROM ai_credit_reservations r JOIN ai_credit_grants g
    WHERE r.reservation_id = NEW.reservation_id
      AND g.grant_id = NEW.grant_id
      AND r.organization_hash = g.organization_hash AND r.app_id = g.app_id
      AND r.state = 'pending'
      AND g.begins_at <= r.created_at AND g.expires_at > r.created_at
      AND g.total_credits - g.consumed_credits - g.reserved_credits >= NEW.reserved_credits
  ) THEN RAISE(ABORT, 'AI_CREDIT_GRANT_NOT_AVAILABLE') END);
END;

CREATE TRIGGER IF NOT EXISTS ai_credit_allocation_reserve
AFTER INSERT ON ai_credit_allocations
BEGIN
  UPDATE ai_credit_grants SET reserved_credits = reserved_credits + NEW.reserved_credits
  WHERE grant_id = NEW.grant_id;
  INSERT INTO ai_credit_transactions(
    transaction_id, reservation_id, grant_id, organization_hash, app_id, task_id,
    event_type, reserved_delta, consumed_delta, created_at
  ) SELECT NEW.reservation_id || ':' || NEW.grant_id || ':reserve',
     r.reservation_id, NEW.grant_id, r.organization_hash, r.app_id, r.task_id,
     'reserve', NEW.reserved_credits, 0, r.created_at
    FROM ai_credit_reservations r WHERE r.reservation_id = NEW.reservation_id;
END;

CREATE TRIGGER IF NOT EXISTS ai_credit_reservation_status_guard
BEFORE UPDATE OF state ON ai_credit_reservations
WHEN NEW.state <> OLD.state
BEGIN
  SELECT (CASE WHEN
    (OLD.state = 'pending' AND NEW.state <> 'reserved') OR
    (OLD.state = 'reserved' AND NEW.state NOT IN ('settled','released')) OR
    OLD.state IN ('settled','released')
  THEN RAISE(ABORT, 'AI_CREDIT_INVALID_TRANSITION') END);
  SELECT (CASE WHEN NEW.state = 'reserved' AND
    (SELECT COALESCE(SUM(reserved_credits),0) FROM ai_credit_allocations
     WHERE reservation_id = NEW.reservation_id) <> NEW.max_charge
  THEN RAISE(ABORT, 'AI_CREDIT_RESERVATION_INCOMPLETE') END);
  SELECT (CASE WHEN NEW.state = 'settled' AND
    (SELECT COALESCE(SUM(consumed_credits),0) FROM ai_credit_allocations
     WHERE reservation_id = NEW.reservation_id) <> NEW.actual_charge
  THEN RAISE(ABORT, 'AI_CREDIT_SETTLEMENT_INCOMPLETE') END);
  SELECT (CASE WHEN NEW.state = 'released' AND NEW.actual_charge <> 0
  THEN RAISE(ABORT, 'AI_CREDIT_RELEASE_WITH_CHARGE') END);
END;

CREATE TRIGGER IF NOT EXISTS ai_credit_reservation_finalized
AFTER UPDATE OF state ON ai_credit_reservations
WHEN OLD.state = 'reserved' AND NEW.state IN ('settled','released')
BEGIN
  UPDATE ai_credit_grants
     SET reserved_credits = reserved_credits - (
       SELECT COALESCE(SUM(a.reserved_credits),0) FROM ai_credit_allocations a
       WHERE a.reservation_id = NEW.reservation_id AND a.grant_id = ai_credit_grants.grant_id
     ),
     consumed_credits = consumed_credits + (
       SELECT COALESCE(SUM(a.consumed_credits),0) FROM ai_credit_allocations a
       WHERE a.reservation_id = NEW.reservation_id AND a.grant_id = ai_credit_grants.grant_id
     )
   WHERE grant_id IN (SELECT grant_id FROM ai_credit_allocations WHERE reservation_id = NEW.reservation_id);
  INSERT INTO ai_credit_transactions (
    transaction_id, reservation_id, grant_id, organization_hash, app_id, task_id,
    event_type, reserved_delta, consumed_delta, created_at
  ) SELECT NEW.reservation_id || ':' || a.grant_id || ':' || NEW.state,
     NEW.reservation_id, a.grant_id, NEW.organization_hash, NEW.app_id, NEW.task_id,
     CASE WHEN NEW.state = 'settled' THEN 'settle' ELSE 'release' END,
     -a.reserved_credits, a.consumed_credits, NEW.settled_at
    FROM ai_credit_allocations a WHERE a.reservation_id = NEW.reservation_id;
END;

-- Real provider spending remains a SEPARATE, non-commercial accounting domain.
-- NULL actual cost means unverified, NEVER interpret NULL as zero.
CREATE TABLE IF NOT EXISTS ai_provider_cost (
  request_ref TEXT PRIMARY KEY,
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  model_id TEXT NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  audio_seconds INTEGER,
  image_units INTEGER,
  estimate_micro_usd INTEGER,
  actual_micro_usd INTEGER,
  price_snapshot TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_cost_scope
 ON ai_provider_cost(organization_hash, app_id, created_at);

CREATE TABLE IF NOT EXISTS ai_budget_windows (
  budget_key TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  hard_cap_micro_usd INTEGER NOT NULL CHECK (hard_cap_micro_usd >= 0),
  reserved_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (reserved_micro_usd >= 0),
  settled_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (settled_micro_usd >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  CHECK(reserved_micro_usd + settled_micro_usd <= hard_cap_micro_usd)
);
