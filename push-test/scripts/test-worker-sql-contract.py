#!/usr/bin/env python3
"""Check actual Worker SQL statements against both migrations, offline only."""
import pathlib,re,sqlite3,tempfile
root=pathlib.Path(__file__).resolve().parents[1]
worker=(root/"src/worker.js").read_text(encoding="utf-8")
schema=(root/"schema.sql").read_text(encoding="utf-8")
migrations=[(root/"migrations/001-delivery-status.sql").read_text(encoding="utf-8"),(root/"migrations/002-delivery-interval.sql").read_text(encoding="utf-8")]
pattern=r'INSERT OR IGNORE INTO deliveries\(alarm_id,start_time,end_time,status,attempted_at\) SELECT [^"]+'
match=re.search(pattern,worker)
assert match,"Worker delivery reservation SQL missing"
reservation=match.group(0)
accepted=re.search(r'UPDATE deliveries SET status=\'accepted\'[^"]+',worker)
failure=re.search(r'UPDATE deliveries SET status=\?,completed_at=\?,http_status=\?[^"]+',worker)
assert accepted and failure,"Worker delivery status update SQL missing"
with tempfile.TemporaryDirectory(prefix="elpris-worker-sql-") as directory:
 path=str(pathlib.Path(directory)/"test.sqlite")
 with sqlite3.connect(path) as db:
  db.executescript(schema)
  db.execute("INSERT INTO deliveries(alarm_id,start_time) VALUES (?,?)",("legacy","2026-10-27T14:00:00.000Z"))
  for migration in migrations: db.executescript(migration)
  assert db.execute("SELECT status,end_time FROM deliveries WHERE alarm_id='legacy'").fetchone()==("reserved",None)
  def reserve(alarm,start,end):
   return db.execute(reservation,(alarm,start,end,123456,alarm,end,start)).rowcount
  assert reserve("a","2026-10-27T14:00:00.000Z","2026-10-27T15:00:00.000Z")==1
  assert reserve("a","2026-10-27T14:15:00.000Z","2026-10-27T15:15:00.000Z")==0
  assert reserve("a","2026-10-27T13:45:00.000Z","2026-10-27T14:15:00.000Z")==0
  assert reserve("a","2026-10-27T15:00:00.000Z","2026-10-27T15:15:00.000Z")==1
  assert reserve("b","2026-10-27T14:15:00.000Z","2026-10-27T15:00:00.000Z")==1
  assert reserve("legacy","2026-10-27T14:05:00.000Z","2026-10-27T14:30:00.000Z")==0
  db.execute(accepted.group(0),(123457,201,"a","2026-10-27T14:00:00.000Z"))
  assert db.execute("SELECT status,http_status FROM deliveries WHERE alarm_id='a' AND start_time='2026-10-27T14:00:00.000Z'").fetchone()==("accepted",201)
  db.execute(failure.group(0),("uncertain",123458,503,"a","2026-10-27T15:00:00.000Z"))
  assert db.execute("SELECT status,http_status FROM deliveries WHERE alarm_id='a' AND start_time='2026-10-27T15:00:00.000Z'").fetchone()==("uncertain",503)
  assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
print("PASS: actual Worker SQL works against schema + migrations 001/002")
print("PASS: legacy reservations, overlapping periods, status updates and integrity")
print("PASS: temporary local database removed; no network, deployment or push")
