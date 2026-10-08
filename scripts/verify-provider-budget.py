#!/usr/bin/env python3
"""Executable SQLite invariants for atomic provider worst-case USD holds.
No Stripe calls, real funds, provider requests or customer data.
"""
from pathlib import Path
import sqlite3
import hashlib
import datetime

db=sqlite3.connect(':memory:')
db.row_factory=sqlite3.Row
for path in ['migrations/0008_commercial_credits.sql',
             'migrations/0009_credit_revocations.sql',
             'migrations/0010_provider_budget_holds.sql']:
    db.executescript(Path(path).read_text(encoding='utf-8'))
now='2026-10-08T19:00:00.000Z'
end='2026-10-09T19:00:00.000Z'
keys=[('global','all'),('environment','production'),('provider','groq'),
      ('task','nestlocal.quote.compose'),('app','nestlocal'),('organization','hash_orgA')]
for typ, ident in keys:
    db.execute('INSERT INTO ai_budget_windows(budget_key,scope_type,scope_id,starts_at,ends_at,hard_cap_micro_usd) VALUES(?,?,?,?,?,?)',
      ('nestai:budget:'+typ+':'+ident,typ,ident,now,end,100))
db.commit()

def reserve(name,estimate,scopes=keys):
    try:
        with db:
            db.execute('INSERT INTO ai_provider_budget_holds(hold_id,organization_hash,app_id,task_id,provider_id,request_key_hash,scope_fingerprint,estimate_micro_usd,required_windows,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
              (name,'hash_orgA','nestlocal','nestlocal.quote.compose','groq',name,'fp',estimate,len(scopes),now,end))
            for typ,ident in scopes:
                db.execute('INSERT INTO ai_provider_budget_allocations(hold_id,budget_key,scope_type,estimate_micro_usd) VALUES(?,?,?,?)',
                  (name,'nestai:budget:'+typ+':'+ident,typ,estimate))
            db.execute("UPDATE ai_provider_budget_holds SET state='reserved' WHERE hold_id=?",(name,))
        return True
    except sqlite3.IntegrityError:
        return False

assert reserve('holdA',70),'first multi-scope reservation must succeed'
assert all(tuple(db.execute('SELECT reserved_micro_usd,settled_micro_usd FROM ai_budget_windows WHERE budget_key=?',('nestai:budget:'+t+':'+i,)).fetchone())==(70,0) for t,i in keys)
assert not reserve('holdB',31),'over 100 microUSD must fail atomically'
assert db.execute('SELECT COUNT(*) FROM ai_provider_budget_holds WHERE hold_id=?',('holdB',)).fetchone()[0]==0
assert db.execute('SELECT COUNT(*) FROM ai_provider_budget_allocations WHERE hold_id=?',('holdB',)).fetchone()[0]==0
assert not reserve('hold_missing',5,keys[:-1]),'missing organization budget must fail'
assert reserve('holdC',30),'remaining exact 30 must be available'

with db:
    db.execute('UPDATE ai_provider_budget_allocations SET finalized_micro_usd=50 WHERE hold_id=?',('holdA',))
    db.execute("UPDATE ai_provider_budget_holds SET state='settled',finalized_micro_usd=50,finalized_at=? WHERE hold_id=?", (now,'holdA'))
assert all(tuple(db.execute('SELECT reserved_micro_usd,settled_micro_usd FROM ai_budget_windows WHERE budget_key=?',('nestai:budget:'+t+':'+i,)).fetchone())==(30,50) for t,i in keys)
with db:
    db.execute('UPDATE ai_provider_budget_allocations SET finalized_micro_usd=0 WHERE hold_id=?',('holdC',))
    db.execute("UPDATE ai_provider_budget_holds SET state='released',finalized_micro_usd=0,finalized_at=? WHERE hold_id=?", (now,'holdC'))
assert reserve('holdD',50),'settling 50 and releasing 30 must replenish reserved capacity'
assert not reserve('holdE',1),'hard cap 100 must never be exceeded'

def must_reject(action, label):
    try:
        with db: action()
    except sqlite3.IntegrityError:
        return
    raise AssertionError(label)
must_reject(lambda:db.execute('UPDATE ai_provider_budget_holds SET estimate_micro_usd=1 WHERE hold_id=?',('holdA',)),
            'provider reservation terms must be immutable')
must_reject(lambda:db.execute('DELETE FROM ai_provider_budget_holds WHERE hold_id=?',('holdA',)),
            'provider hold must retain audit history')
must_reject(lambda:db.execute('UPDATE ai_provider_budget_allocations SET finalized_micro_usd=10 WHERE hold_id=?',('holdA',)),
            'double-settling allocation must fail')
must_reject(lambda:db.execute("UPDATE ai_provider_budget_holds SET state='released' WHERE hold_id=?",('holdA',)),
            'settled hold cannot be changed to released')
assert db.execute('SELECT COUNT(*) FROM ai_provider_budget_holds').fetchone()[0]==3
print('PASS provider budget: 6-scope atomic reserve/settle/release, exact hard cap, missing-scope rollback, immutable audit and no double settle')
