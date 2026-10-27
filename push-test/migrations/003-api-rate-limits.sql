-- Apply ONLY to isolated elpris-push-isolated-test-db before deploying updated Worker.
-- Hourly counters are scoped to hashed subjects; never store raw client IP addresses.
CREATE TABLE IF NOT EXISTS api_rate_limits (
 bucket TEXT PRIMARY KEY,
 hits INTEGER NOT NULL CHECK(hits>=1),
 expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_expires ON api_rate_limits(expires_at);
