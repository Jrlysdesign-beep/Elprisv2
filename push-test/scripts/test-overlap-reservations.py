#!/usr/bin/env python3
"""Temporary SQLite overlap tests; no Cloudflare, network or push."""
import pathlib,sqlite3,tempfile,concurrent.futures,threading
root=pathlib.Path(__file__).resolve().parents[1]
sql="""INSERT OR IGNORE INTO deliveries(alarm_id,start_time,end_time,status,attempted_at)
 SELECT ?,?,?,'reserved',? WHERE NOT EXISTS (
 SELECT 1 FROM deliveries WHERE alarm_id=? AND start_time<?
 AND COALESCE(end_time,strftime('%Y-%m-%dT%H:%M:%fZ',start_time,'+15 minutes'))>?)"""
def reserve(path,alarm,start,end,gate=None):
 if gate:gate.wait(timeout=15)
 with sqlite3.connect(path,timeout=15) as db:
  db.execute("PRAGMA busy_timeout=15000")
  n=db.execute(sql,(alarm,start,end,0,alarm,end,start)).rowcount
  db.commit();return n
with tempfile.TemporaryDirectory() as d:
 path=str(pathlib.Path(d)/"delivery.sqlite")
 with sqlite3.connect(path) as db:
  db.executescript((root/"schema.sql").read_text())
  db.executescript((root/"migrations/001-delivery-status.sql").read_text())
  db.executescript((root/"migrations/002-delivery-interval.sql").read_text())
 a="2026-10-27T14:00:00.000Z";b="2026-10-27T15:00:00.000Z"
 assert reserve(path,"a",a,b)==1
 assert reserve(path,"a","2026-10-27T14:15:00.000Z","2026-10-27T15:30:00.000Z")==0
 assert reserve(path,"a","2026-10-27T13:45:00.000Z","2026-10-27T14:30:00.000Z")==0
 assert reserve(path,"a",b,"2026-10-27T15:15:00.000Z")==1
 assert reserve(path,"b",a,b)==1
 with sqlite3.connect(path) as db:
  db.execute("INSERT INTO deliveries(alarm_id,start_time) VALUES(?,?)",("legacy","2026-10-27T14:00:00.000Z"))
  db.commit()
 assert reserve(path,"legacy","2026-10-27T14:05:00.000Z","2026-10-27T14:30:00.000Z")==0
 gate=threading.Barrier(8)
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  jobs=[pool.submit(reserve,path,"race","2026-10-27T14:00:00.000Z","2026-10-27T15:00:00.000Z",gate) for _ in range(8)]
  outcomes=[j.result(timeout=25) for j in jobs]
 assert outcomes.count(1)==1 and outcomes.count(0)==7,outcomes
 with sqlite3.connect(path) as db:assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
 print("PASS: overlapping start shifts blocked, adjacent periods allowed, legacy fallback works")
 print("PASS: 8 simultaneous overlapping attempts => exactly one reservation")
 print("PASS: local temporary database removed; no network, push, or Cloudflare access")
