-- Apply only to the isolated test D1 after migration 001.
-- Existing reservations conservatively cover at least their first 15-minute slot.
ALTER TABLE deliveries ADD COLUMN end_time TEXT;
CREATE INDEX IF NOT EXISTS idx_deliveries_alarm_interval ON deliveries(alarm_id,start_time,end_time);
