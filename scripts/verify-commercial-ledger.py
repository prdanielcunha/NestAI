#!/usr/bin/env python3
"""Execute the D1 commercial credit migration in SQLite and exercise atomic ledger invariants."""
import sqlite3
from pathlib import Path

db = sqlite3.connect(":memory:", isolation_level=None)
db.execute("PRAGMA foreign_keys=ON")
db.executescript(Path("migrations/0008_commercial_credits.sql").read_text())
at = "2026-10-08T12:00:00.000Z"

def grant(key, source, amount, end):
    db.execute(
      "INSERT INTO ai_credit_grants(grant_id,organization_hash,app_id,source,source_ref,grant_version,total_credits,begins_at,expires_at,created_at) "
      "VALUES (?,?,?,?,?,1,?,?,?,?)",
      (key,"hashed_org","nestlocal",source,key,amount,"2026-10-01T00:00:00.000Z",end,at),
    )

def balance():
    return db.execute(
      "SELECT COALESCE(SUM(total_credits-consumed_credits-reserved_credits),0) "
      "FROM ai_credit_grants WHERE organization_hash='hashed_org' AND app_id='nestlocal'"
    ).fetchone()[0]

def reserve(id, charge, moment=at):
    db.execute("BEGIN IMMEDIATE")
    try:
        db.execute(
          "INSERT INTO ai_credit_reservations(reservation_id,organization_hash,app_id,task_id,idempotency_key_hash,request_hash,price_version,max_charge,state,created_at,expires_at) "
          "VALUES (?,'hashed_org','nestlocal','nestlocal.request.extract',?,? ,1,?,'pending',?,'2026-10-08T12:20:00.000Z')",
          (id,id,id,charge,moment),
        )
        db.execute(
          """WITH eligible AS (
           SELECT grant_id,total_credits-consumed_credits-reserved_credits AS available,
           SUM(total_credits-consumed_credits-reserved_credits) OVER (
             ORDER BY expires_at,grant_id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prior
           FROM ai_credit_grants
           WHERE organization_hash=? AND app_id=? AND begins_at<=? AND expires_at>?
             AND total_credits-consumed_credits-reserved_credits>0
           ), eligible_total AS (SELECT COALESCE(SUM(available),0) AS total FROM eligible)
           INSERT INTO ai_credit_allocations(reservation_id,grant_id,reserved_credits,consumed_credits)
           SELECT ?,grant_id,MIN(available,MAX(0,?-COALESCE(prior,0))),0
           FROM eligible
           WHERE (SELECT total FROM eligible_total)>=? AND COALESCE(prior,0)<?""",
          ("hashed_org","nestlocal",moment,moment,id,charge,charge,charge),
        )
        db.execute("UPDATE ai_credit_reservations SET state='reserved' WHERE reservation_id=?", (id,))
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

def settle(id, actual, released=False):
    db.execute("BEGIN IMMEDIATE")
    try:
        consumed = 0
        allocations = db.execute(
          "SELECT a.grant_id,a.reserved_credits FROM ai_credit_allocations a JOIN ai_credit_grants g ON g.grant_id=a.grant_id "
          "WHERE a.reservation_id=? ORDER BY g.expires_at,a.grant_id",(id,),
        ).fetchall()
        for gid, amount in allocations:
            part = min(amount,max(0,actual-consumed))
            consumed += part
            db.execute(
              "UPDATE ai_credit_allocations SET consumed_credits=? WHERE reservation_id=? AND grant_id=?",
              (part,id,gid),
            )
        db.execute("UPDATE ai_credit_reservations SET state=?,actual_charge=?,settled_at=? WHERE reservation_id=?",
          ("released" if released else "settled",0 if released else actual,at,id))
        db.execute("COMMIT")
    except Exception:
        db.execute("ROLLBACK")
        raise

# Two grants that individually cannot fund a 30-credit charge must work together.
grant("grant_1","trial",20,"2026-10-15T00:00:00.000Z")
grant("grant_2","addon",20,"2026-10-16T00:00:00.000Z")
assert balance()==40
reserve("reservation_1",30)
assert balance()==10
allocated=db.execute("SELECT SUM(reserved_credits) FROM ai_credit_allocations WHERE reservation_id='reservation_1'").fetchone()[0]
assert allocated==30
settle("reservation_1",27)
assert balance()==13
assert db.execute("SELECT SUM(consumed_credits) FROM ai_credit_grants").fetchone()[0]==27
assert db.execute("SELECT SUM(reserved_credits) FROM ai_credit_grants").fetchone()[0]==0

# Duplicate idempotency key cannot create another charge/reservation.
try:
    reserve("reservation_1",10)
except sqlite3.IntegrityError:
    pass
else:
    raise AssertionError("duplicate reservation was accepted")
assert balance()==13

# Insufficient combined grants fail transactionally without leaving a pending record.
try:
    reserve("reservation_too_large",14)
except sqlite3.IntegrityError as exc:
    assert "AI_CREDIT_RESERVATION_INCOMPLETE" in str(exc)
else:
    raise AssertionError("overdraft was accepted")
assert balance()==13
assert db.execute("SELECT COUNT(*) FROM ai_credit_reservations WHERE reservation_id='reservation_too_large'").fetchone()[0]==0

# Failure/refund releases every allocation in a single trigger-driven transition.
reserve("reservation_to_refund",13)
assert balance()==0
settle("reservation_to_refund",0,released=True)
assert balance()==13

# Expired grants cannot be used even if accounting balances remain.
try:
    reserve("reservation_expired",1,"2026-10-17T12:00:00.000Z")
except sqlite3.IntegrityError as exc:
    assert "AI_CREDIT_RESERVATION_INCOMPLETE" in str(exc)
else:
    raise AssertionError("expired credit was accepted")

# Event log balances to the post-settlement grant state.
assert db.execute("SELECT SUM(reserved_delta) FROM ai_credit_transactions").fetchone()[0]==0
assert db.execute("SELECT SUM(consumed_delta) FROM ai_credit_transactions").fetchone()[0]==27
assert db.execute("SELECT COUNT(*) FROM ai_credit_transactions WHERE event_type='release'").fetchone()[0]==1
print("Commercial credit SQLite invariants PASS: allocation, idempotency, refund, expiry, ledger reconciliation")
