# Manual recovery runbook — isolated D1 only

**Scope:** `elpris-push-isolated-test-db` / `2811e53d-ee9d-45d2-94dc-d8ffed33d447`. This is a manual incident procedure, **not** an executable remote-restore workflow. Never apply to the public app.

## Preconditions / STOP gates
1. Stop all writers to the isolated test DB, including test Worker API traffic and any manual jobs. Do not assume disabled cron means no writes. Record the start of the freeze and confirm no new writes.
2. Obtain an explicit human approval for recovery, and verify the exact Cloudflare account, isolated database name and UUID. Never paste credentials or encryption keys in logs or tickets.
3. Identify the affected GitHub Actions run, its encrypted `isolated-d1-encrypted-backup-<run_id>` artifact, `SHA256SUMS`, and the backup key. The workflow currently retains artifacts for **7 days** only; if unavailable, STOP. A backup made before a migration may lose any later writes.
4. Determine whether there were legitimate writes since backup. If yes, STOP and reconcile separately; do not overwrite newer records.
5. Preserve a **separate** current-state incident snapshot before recovery, with restricted access. No in-place DROP/DELETE/reimport until a restored candidate has passed checks.

## Validate and decrypt locally, without exposing data
Work in a private temporary directory with `umask 077`. Download the encrypted artifact using authorized GitHub access; verify the expected run and artifact identity. The SHA256 file is an accidental-corruption check, **not** cryptographic authenticity. Do not print the SQL dump.

```bash
umask 077
sha256sum -c SHA256SUMS
# Supply BACKUP_ENCRYPTION_KEY securely from your secret manager; never echo it.
openssl enc -d -aes-256-cbc -pbkdf2 -iter 250000 \
  -in isolated-d1-backup.sql.enc -out restored.sql \
  -pass env:BACKUP_ENCRYPTION_KEY
test -s restored.sql
```

Check the SQL dump for expected subscriptions, alarms and deliveries schema and run a restore **to a new local SQLite database** (not a remote D1) before any remote changes. Validate `PRAGMA integrity_check`, foreign keys, row counts and important IDs against the recorded pre-migration baseline. The encrypted backup includes sensitive push subscriptions; handle plaintext as secret and securely clean up.

## Rehearse / decide
Run `python3 scripts/test-manual-d1-recovery-drill.py` locally or in a credential-free manual GitHub dry run. This uses synthetic data and never contacts Cloudflare. If the isolated D1 schema is partial or unexpected, **do not rerun** the non-idempotent migrations. Review the failure point and agree on the restore strategy.

## Remote recovery — separate, explicitly approved operation (NOT automated)
Only after the backup and reconstructed candidate have been verified, a maintenance freeze confirmed, and a human has explicitly approved the isolated target:
- Prefer a new **isolated recovery database** to validate imported data and application behavior before any switch. Creating a DB or importing to Cloudflare is a separate operation that requires approval; this runbook does not perform it.
- Validate exact database UUID, row counts, integrity, alarm/subscription relationships and API behavior before considering any cutover.
- If in-place recovery is unavoidable, prepare a reviewed, target-specific procedure that includes current-state backup, write freeze, a rollback of the rollback, and explicit approval. Never execute an unreviewed SQL dump against a populated remote database.
- Do not resume writes until the recovered data and schema are independently verified and approved.

## Failure handling
Wrong key, checksum mismatch, missing backup, inconsistent row counts, active writes, unexpected schema, partial restore or missing approvals: **STOP**. Preserve evidence and leave the remote database unchanged. Do not auto-retry migrations or auto-rollback.

## Known limitations
The existing OpenSSL AES-CBC backup is encrypted but not authenticated; SHA256 beside the file does not prevent malicious substitution. The seven-day retention may be inadequate. Offline SQLite success is **not** proof of Cloudflare D1 import compatibility or recovery timing. These risks must be addressed before production-like recovery.
