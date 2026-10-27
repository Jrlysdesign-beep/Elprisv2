-- Run only against the isolated TEST D1 database, before deploying updated worker.
-- Never apply to the public app or its database.
ALTER TABLE deliveries ADD COLUMN status TEXT NOT NULL DEFAULT 'reserved'
 CHECK(status IN ('reserved','accepted','failed','uncertain'));
ALTER TABLE deliveries ADD COLUMN attempted_at INTEGER;
ALTER TABLE deliveries ADD COLUMN completed_at INTEGER;
ALTER TABLE deliveries ADD COLUMN http_status INTEGER;
