#!/usr/bin/env bash
# Read-only verification of isolated D1 schema at an exact migration stage.
set -euo pipefail
stage="${1:?stage required}"
test "${DB_NAME:-}" = "elpris-push-isolated-test-db"
test -f wrangler.jsonc
query="SELECT (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('subscriptions','alarms','deliveries')) AS base_tables, (SELECT COUNT(*) FROM pragma_table_info('deliveries') WHERE name IN ('status','attempted_at','completed_at','http_status','end_time')) AS delivery_columns, (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_deliveries_alarm_interval') AS overlap_index, (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='api_rate_limits') AS rate_table, (SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_api_rate_limits_expires') AS rate_index"
npx wrangler d1 execute "$DB_NAME" --remote --config wrangler.jsonc --json --command "$query" | python3 scripts/check-migration-stage.py "$stage"
