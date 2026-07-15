-- 005 dropped consultant_code_unique (partial index), but some DBs also have
-- a table UNIQUE constraint named consultant_consultant_code_key that still
-- blocks the same asesor code across offices.
ALTER TABLE consultant DROP CONSTRAINT IF EXISTS consultant_consultant_code_key;
DROP INDEX IF EXISTS consultant_code_unique;
DROP INDEX IF EXISTS consultant_consultant_code_key;

-- Keep / restore unique per office (idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS consultant_code_per_office_unique
    ON consultant (office_id, consultant_code)
    WHERE consultant_code IS NOT NULL;
