#!/usr/bin/env python3
"""Offline-only disaster recovery drill. Never invokes Wrangler, network or Cloudflare."""
import hashlib,os,pathlib,sqlite3,subprocess,tempfile
ROOT=pathlib.Path(__file__).resolve().parents[1]
MIGRATIONS=[ROOT/"migrations"/n for n in ("001-delivery-status.sql","002-delivery-interval.sql","003-api-rate-limits.sql")]
KEY="synthetic-only-rollback-key-not-for-real-data"
def snapshot(db):
 return {table:db.execute("SELECT * FROM "+table+" ORDER BY 1").fetchall() for table in ("subscriptions","alarms","deliveries")}
def decrypt(cipher,output,key):
 return subprocess.run(["openssl","enc","-d","-aes-256-cbc","-pbkdf2","-iter","250000","-in",str(cipher),"-out",str(output),"-pass","env:BACKUP_ENCRYPTION_KEY"],env={**os.environ,"BACKUP_ENCRYPTION_KEY":key},capture_output=True).returncode
def validate_backup(cipher,sha,sql,key):
 if hashlib.sha256(cipher.read_bytes()).hexdigest()!=sha:raise ValueError("Encrypted artifact checksum mismatch")
 if decrypt(cipher,sql,key)!=0:raise ValueError("Cannot decrypt backup")
 with sqlite3.connect(":memory:") as db:
  db.executescript(sql.read_text())
  if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("Backup integrity failure")
  if sorted(snapshot(db))!=["alarms","deliveries","subscriptions"]:raise ValueError("Missing tables")
def restore_to_new_file(sql,target):
 if target.exists():raise FileExistsError("Never overwrite an existing database")
 with sqlite3.connect(target) as db:
  db.executescript(sql.read_text())
  if db.execute("PRAGMA integrity_check").fetchone()[0]!="ok":raise ValueError("Restore integrity failure")
def main():
 with tempfile.TemporaryDirectory(prefix="elpris-recovery-drill-") as directory:
  p=pathlib.Path(directory);source=p/"source.db"
  with sqlite3.connect(source) as db:
   db.executescript((ROOT/"schema.sql").read_text())
   db.execute("INSERT INTO subscriptions VALUES(?,?,?,?,?)",("synthetic-sub","https://example.invalid/push", '{"fake":true}',"fake",1))
   db.execute("INSERT INTO alarms VALUES(?,?,?,?,?,?)",("synthetic-alarm","synthetic-sub","DK2",0.5,3,1))
   db.execute("INSERT INTO deliveries VALUES(?,?)",("synthetic-alarm","2026-10-27T14:00:00Z"))
   original=snapshot(db);dump="\n".join(db.iterdump())
  plain=p/"backup.sql";plain.write_text(dump)
  cipher=p/"backup.sql.enc"
  cmd=["openssl","enc","-aes-256-cbc","-pbkdf2","-iter","250000","-salt","-in",str(plain),"-out",str(cipher),"-pass","env:BACKUP_ENCRYPTION_KEY"]
  subprocess.run(cmd,check=True,capture_output=True,env={**os.environ,"BACKUP_ENCRYPTION_KEY":KEY})
  checksum=hashlib.sha256(cipher.read_bytes()).hexdigest()
  recovered=p/"decrypted.sql";validate_backup(cipher,checksum,recovered,KEY)
  checks=0
  for stop in ("before", "after-001", "partial-001", "after-002", "partial-002", "after-003"):
   target=p/(stop+".db")
   with sqlite3.connect(source) as src,sqlite3.connect(target) as dst:src.backup(dst)
   with sqlite3.connect(target) as db:
    if stop in ("after-001","after-002","partial-002","after-003"):db.executescript(MIGRATIONS[0].read_text())
    if stop in ("after-002","after-003"):db.executescript(MIGRATIONS[1].read_text())
    if stop=="after-003":db.executescript(MIGRATIONS[2].read_text())
    if stop=="partial-001":db.execute("ALTER TABLE deliveries ADD COLUMN status TEXT DEFAULT 'reserved'")
    if stop=="partial-002":db.execute("ALTER TABLE deliveries ADD COLUMN end_time TEXT")
   restore=p/(stop+"-restored.db")
   restore_to_new_file(recovered,restore)
   with sqlite3.connect(restore) as db:
    assert snapshot(db)==original,stop
    assert db.execute("PRAGMA integrity_check").fetchone()[0]=="ok"
    assert [r[1] for r in db.execute("PRAGMA table_info(deliveries)")] == ["alarm_id","start_time"]
   checks+=1
  try:restore_to_new_file(recovered,restore)
  except FileExistsError:checks+=1
  else:raise AssertionError("Existing database overwritten")
  try:validate_backup(cipher,"0"*64,p/"bad-checksum.sql",KEY)
  except ValueError:checks+=1
  else:raise AssertionError("Corrupt checksum accepted")
  try:validate_backup(cipher,checksum,p/"bad-key.sql","wrong-key")
  except ValueError:checks+=1
  else:raise AssertionError("Wrong key accepted")
  tampered=p/"tampered.enc";tampered.write_bytes(cipher.read_bytes()[:-1]+bytes([cipher.read_bytes()[-1]^1]))
  try:validate_backup(tampered,checksum,p/"tampered.sql",KEY)
  except ValueError:checks+=1
  else:raise AssertionError("Tampered backup accepted")
  print(f"PASS: {checks} offline recovery checks; 6 migration/partial states, encrypted backup, wrong key, tamper and no-overwrite")
  print("No Wrangler, network, remote database or deployment used")
if __name__=="__main__":main()
