#!/usr/bin/env python3
"""Verify the actual Worker rate-limit SQL atomically in local temporary SQLite."""
import concurrent.futures,pathlib,sqlite3,tempfile,threading
root=pathlib.Path(__file__).resolve().parents[1]
sql="INSERT INTO api_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits"
def hit(path,gate):
 gate.wait(timeout=15)
 with sqlite3.connect(path,timeout=15) as db:
  db.execute("PRAGMA busy_timeout=15000")
  return db.execute(sql,("register:hashed",1761562800000)).fetchone()[0]
with tempfile.TemporaryDirectory(prefix="elpris-api-security-") as directory:
 path=str(pathlib.Path(directory)/"test.db")
 with sqlite3.connect(path) as db:
  db.executescript((root/"schema.sql").read_text())
  for name in ["001-delivery-status.sql","002-delivery-interval.sql","003-api-rate-limits.sql"]:
   db.executescript((root/"migrations"/name).read_text())
 gate=threading.Barrier(12)
 with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
  counts=[f.result(timeout=25) for f in [pool.submit(hit,path,gate) for _ in range(12)]]
 assert sorted(counts)==list(range(1,13)),counts
 assert sum(x<=5 for x in counts)==5
 with sqlite3.connect(path) as db:
  assert db.execute("SELECT hits FROM api_rate_limits WHERE bucket=?",("register:hashed",)).fetchone()[0]==12
  assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
 print("PASS: all three migrations; 12 concurrent requests counted atomically; only 5 admitted")
 print("PASS: temporary SQLite removed; no push, Cloudflare or deployment")
