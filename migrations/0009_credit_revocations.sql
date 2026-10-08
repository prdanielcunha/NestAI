-- D1 credit reversals: disable unspent credits after verified Stripe
-- refund/chargeback. Existing consumed credits stay in immutable audit records.
ALTER TABLE ai_credit_grants ADD COLUMN revoked_at TEXT;
ALTER TABLE ai_credit_grants ADD COLUMN revoke_reason TEXT;

CREATE TABLE IF NOT EXISTS ai_credit_revocations (
  revocation_id TEXT PRIMARY KEY,
  grant_id TEXT NOT NULL REFERENCES ai_credit_grants(grant_id),
  organization_hash TEXT NOT NULL,
  app_id TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('refund','dispute','chargeback','billing_correction')),
  created_at TEXT NOT NULL,
  UNIQUE(grant_id)
);
CREATE TRIGGER IF NOT EXISTS ai_credit_revocation_immutable_update
BEFORE UPDATE ON ai_credit_revocations
BEGIN SELECT RAISE(ABORT, 'AI_CREDIT_REVOCATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS ai_credit_revocation_immutable_delete
BEFORE DELETE ON ai_credit_revocations
BEGIN SELECT RAISE(ABORT, 'AI_CREDIT_REVOCATION_IMMUTABLE'); END;

-- A grant can only transition from non-revoked to revoked one time.
CREATE TRIGGER IF NOT EXISTS ai_credit_revocation_once
BEFORE UPDATE OF revoked_at,revoke_reason ON ai_credit_grants
BEGIN
  SELECT (CASE WHEN
    OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR
    NEW.revoke_reason IS NULL OR NEW.revoke_reason NOT IN
      ('refund','dispute','chargeback','billing_correction')
  THEN RAISE(ABORT, 'AI_CREDIT_ALREADY_REVOKED_OR_INVALID') END);
END;

DROP TRIGGER IF EXISTS ai_credit_allocation_guard;
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
      AND g.revoked_at IS NULL
      AND g.total_credits - g.consumed_credits - g.reserved_credits >= NEW.reserved_credits
  ) THEN RAISE(ABORT, 'AI_CREDIT_GRANT_NOT_AVAILABLE') END);
END;
