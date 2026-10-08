-- Atomic pre-provider financial reservations (paid inference stays disabled).
-- A credit balance is NOT a financial budget. Every paid provider request
-- must reserve a known worst-case USD cost against all required windows.
CREATE TABLE IF NOT EXISTS ai_provider_budget_holds (
  hold_id TEXT PRIMARY KEY,
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  request_key_hash TEXT NOT NULL,
  scope_fingerprint TEXT NOT NULL,
  estimate_micro_usd INTEGER NOT NULL CHECK(estimate_micro_usd>0),
  finalized_micro_usd INTEGER,
  state TEXT NOT NULL DEFAULT 'pending'
    CHECK(state IN ('pending','reserved','settled','released')),
  required_windows INTEGER NOT NULL CHECK(required_windows BETWEEN 5 AND 8),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  finalized_at TEXT,
  UNIQUE(organization_hash,app_id,task_id,request_key_hash),
  CHECK(finalized_micro_usd IS NULL OR
    (finalized_micro_usd BETWEEN 0 AND estimate_micro_usd))
);
CREATE INDEX IF NOT EXISTS idx_ai_provider_budget_holds_stale
 ON ai_provider_budget_holds(state,expires_at);

CREATE TABLE IF NOT EXISTS ai_provider_budget_allocations (
  hold_id TEXT NOT NULL REFERENCES ai_provider_budget_holds(hold_id),
  budget_key TEXT NOT NULL REFERENCES ai_budget_windows(budget_key),
  scope_type TEXT NOT NULL
    CHECK(scope_type IN ('global','environment','provider','task','app','organization','user','trial')),
  estimate_micro_usd INTEGER NOT NULL CHECK(estimate_micro_usd>0),
  finalized_micro_usd INTEGER,
  PRIMARY KEY(hold_id,budget_key),
  UNIQUE(hold_id,scope_type),
  CHECK(finalized_micro_usd IS NULL OR
    (finalized_micro_usd BETWEEN 0 AND estimate_micro_usd))
);

CREATE TRIGGER IF NOT EXISTS ai_budget_hold_cannot_delete
BEFORE DELETE ON ai_provider_budget_holds
BEGIN SELECT RAISE(ABORT,'AI_BUDGET_HOLD_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_cannot_delete
BEFORE DELETE ON ai_provider_budget_allocations
BEGIN SELECT RAISE(ABORT,'AI_BUDGET_ALLOCATION_IMMUTABLE'); END;

CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_preflight
BEFORE INSERT ON ai_provider_budget_allocations
BEGIN
  SELECT (CASE WHEN NOT EXISTS(
    SELECT 1 FROM ai_provider_budget_holds h JOIN ai_budget_windows w
      ON w.budget_key=NEW.budget_key
    WHERE h.hold_id=NEW.hold_id AND h.state='pending'
      AND w.scope_type=NEW.scope_type AND w.status='active'
      AND w.starts_at<=h.created_at AND w.ends_at>h.created_at
      AND w.hard_cap_micro_usd-w.reserved_micro_usd-w.settled_micro_usd
        >=NEW.estimate_micro_usd
      AND NEW.estimate_micro_usd=h.estimate_micro_usd
  ) THEN RAISE(ABORT,'AI_GLOBAL_BUDGET_REACHED') END);
END;
CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_reserve
AFTER INSERT ON ai_provider_budget_allocations
BEGIN
  UPDATE ai_budget_windows SET reserved_micro_usd=reserved_micro_usd+NEW.estimate_micro_usd
    WHERE budget_key=NEW.budget_key;
END;

CREATE TRIGGER IF NOT EXISTS ai_budget_hold_state_guard
BEFORE UPDATE OF state ON ai_provider_budget_holds
BEGIN
  SELECT (CASE WHEN
    (OLD.state='pending' AND NEW.state='reserved' AND
      (SELECT COUNT(*) FROM ai_provider_budget_allocations WHERE hold_id=OLD.hold_id)=OLD.required_windows)
    OR
    (OLD.state='reserved' AND NEW.state IN ('settled','released') AND
      NEW.finalized_micro_usd IS NOT NULL AND NEW.finalized_at IS NOT NULL
      AND
      (SELECT COUNT(*) FROM ai_provider_budget_allocations
        WHERE hold_id=OLD.hold_id AND finalized_micro_usd=NEW.finalized_micro_usd)
       =OLD.required_windows)
  THEN NULL ELSE RAISE(ABORT,'AI_BUDGET_HOLD_TRANSITION_DENIED') END);
END;
CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_finalization_preflight
BEFORE UPDATE OF finalized_micro_usd ON ai_provider_budget_allocations
BEGIN
  SELECT (CASE WHEN OLD.finalized_micro_usd IS NOT NULL OR
    NEW.finalized_micro_usd IS NULL OR
    NOT EXISTS (SELECT 1 FROM ai_provider_budget_holds h
      WHERE h.hold_id=OLD.hold_id AND h.state='reserved')
    THEN RAISE(ABORT,'AI_BUDGET_ALLOCATION_ALREADY_FINALIZED') END);
END;
CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_finalize
AFTER UPDATE OF finalized_micro_usd ON ai_provider_budget_allocations
BEGIN
  UPDATE ai_budget_windows SET
    reserved_micro_usd=reserved_micro_usd-OLD.estimate_micro_usd,
    settled_micro_usd=settled_micro_usd+NEW.finalized_micro_usd
    WHERE budget_key=NEW.budget_key;
END;
CREATE TRIGGER IF NOT EXISTS ai_budget_hold_immutable_terms
BEFORE UPDATE OF organization_hash,app_id,task_id,provider_id,request_key_hash,
  scope_fingerprint,estimate_micro_usd,required_windows,created_at,expires_at
ON ai_provider_budget_holds
BEGIN SELECT RAISE(ABORT,'AI_BUDGET_HOLD_TERMS_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ai_budget_allocation_immutable_terms
BEFORE UPDATE OF hold_id,budget_key,scope_type,estimate_micro_usd
ON ai_provider_budget_allocations
BEGIN SELECT RAISE(ABORT,'AI_BUDGET_ALLOCATION_TERMS_IMMUTABLE'); END;
