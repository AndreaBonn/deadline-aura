-- Add cognitive_type column for enhanced AI scoring
-- Values: analytical, creative, social, passive, administrative

-- SQLite ALTER TABLE doesn't support IF NOT EXISTS for columns,
-- so the migration runner in db.js handles idempotency via pragma table_info check.
-- This file serves as documentation of the schema change.

-- Applied idempotently in db.js runMigrations()
