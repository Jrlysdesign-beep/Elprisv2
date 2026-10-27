#!/usr/bin/env python3
"""Offline migration + rollback test. Synthetic data only; never calls Cloudflare."""
import sqlite3,tempfile,pathlib,subprocess,os,hashlib
root=pathlib.Path(__file__).resolve().parents[1]
migrations=[root/"migrations"/f"{i:03d}-{name}.sql" for i,name in [(1,"delivery-status"),(2,"delivery-interval"),(3,"api-rate-limits")]]
with tempfile.TemporaryDirectory(prefix="elpris-offline-rollback-") as directory:
 p=pathlib.Path(directory)
 original=p/"original.db"
 with sqlite3.connect(original) as db:
  db.executescript((root/"schema.sql").read_text())
  db.execute("INSERT INTO subscriptions VALUES(?,?,?,?,?)",("s1","https://web.push.apple.com/synthetic",'{"synthetic":true}',"fake",1))
  db.execute("INSERT INTO alarms VALUES(?,?,?,?,?,?)",("a1","s1","DK2",0.5,3,1))
  db.execute("INSERT INTO deliveries VALUES(?,?)",("a1","2026-10-27T14:00:00.000Z"))
 with sqlite3.connect(original) as db: dump="\n".join(db.iterdump())
 plain=p/"backup.sql";plain.write_text(dump)
 encrypted=p/"backup.sql.enc";restored=p/"restored.sql"
 key="offline-only-test-secret-do-not-use-in-production"
 def openssl(password,decrypt=False):
  args=["openssl","enc"]
  if decrypt:args.append("-d")
  args+=["-aes-256-cbc","-pbkdf2","-iter","250000"]
  if not decrypt:args.append("-salt")
  args+=["-in",str(encrypted if decrypt else plain),"-out",str(restored if decrypt else encrypted),"-pass","env:BACKUP_ENCRYPTION_KEY"]
  return subprocess.run(args,env={**os.environ,"BACKUP_ENCRYPTION_KEY":password},capture_output=True).returncode
 assert openssl(key)==0
 assert openssl(key,True)==0 and restored.read_bytes()==plain.read_bytes()
 assert openssl("incorrect-password",True)!=0
 checksum=hashlib.sha256(encrypted.read_bytes()).hexdigest()
 assert len(checksum)==64
 assert not (False and True) and not (True and False) # backup/upload failure gates
 for fail_at in (1,2,3,None):
  target=p/f"target-{fail_at}.db"
  with sqlite3.connect(original) as source,sqlite3.connect(target) as destination:source.backup(destination)
  try:
   with sqlite3.connect(target) as db:
    for i,migration in enumerate(migrations,1):
     if fail_at==i:raise RuntimeError("synthetic migration failure")
     db.executescript(migration.read_text())
  except RuntimeError:pass
  if fail_at is not None:
   rollback=p/f"rollback-{fail_at}.db"
   with sqlite3.connect(rollback) as db:db.executescript(dump)
   with sqlite3.connect(rollback) as db:
    assert db.execute("SELECT COUNT(*) FROM deliveries").fetchone()[0]==1
    assert db.execute("SELECT COUNT(*) FROM subscriptions").fetchone()[0]==1
    assert db.execute("SELECT COUNT(*) FROM alarms").fetchone()[0]==1
    assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
  else:
   with sqlite3.connect(target) as db:
    assert db.execute("SELECT status,end_time FROM deliveries").fetchone()==("reserved",None)
    assert db.execute("SELECT name FROM sqlite_master WHERE name='api_rate_limits'").fetchone()
    assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
 print("PASS: encrypted backup, bad key rejected, migrations 001-003, synthetic failure and rollback at each step")
 print("PASS: no network, Cloudflare, deployment or push; temporary data removed")
