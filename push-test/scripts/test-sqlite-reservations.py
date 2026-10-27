#!/usr/bin/env python3
"""Real SQLite concurrency tests. Temporary local DB only. No network or push."""
import concurrent.futures
import pathlib
import sqlite3
import tempfile
import threading

SCHEMA = pathlib.Path(__file__).resolve().parents[1] / "schema.sql"
INSERT = "INSERT OR IGNORE INTO deliveries(alarm_id,start_time) VALUES(?,?)"

def reserve(path, alarm, instant, gate=None):
    if gate:
        gate.wait(timeout=15)
    with sqlite3.connect(path, timeout=15) as db:
        db.execute("PRAGMA busy_timeout=15000")
        cursor = db.execute(INSERT, (alarm, instant))
        db.commit()
        return cursor.rowcount

def main():
    with tempfile.TemporaryDirectory(prefix="elpris-sqlite-test-") as directory:
        path = str(pathlib.Path(directory) / "reservations.sqlite3")
        with sqlite3.connect(path) as db:
            db.executescript(SCHEMA.read_text(encoding="utf-8"))
            db.execute("PRAGMA journal_mode=WAL")
        instant = "2026-10-25T01:15:00.000Z"
        gate = threading.Barrier(12)
        with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
            futures = [pool.submit(reserve,path,"alarm-A",instant,gate) for _ in range(12)]
            outcomes = [f.result(timeout=25) for f in futures]
        assert outcomes.count(1) == 1, outcomes
        assert outcomes.count(0) == 11, outcomes
        assert reserve(path,"alarm-A",instant) == 0
        assert reserve(path,"alarm-B",instant) == 1
        assert reserve(path,"alarm-A","2026-10-25T02:15:00.000Z") == 1
        assert reserve(path,"alarm-A","2026-10-25T00:15:00.000Z") == 1
        with sqlite3.connect(path) as db:
            rows = db.execute("SELECT alarm_id,start_time FROM deliveries ORDER BY alarm_id,start_time").fetchall()
            assert len(rows) == 4, rows
            assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        print("PASS: 12 concurrent attempts => exactly 1 reservation and 11 ignored")
        print("PASS: retries ignored; other alarm and distinct UTC intervals allowed")
        print("PASS: actual schema PRIMARY KEY and SQLite integrity verified")
        print("PASS: temporary database removed; no network, push or Cloudflare access")

if __name__ == "__main__":
    main()
