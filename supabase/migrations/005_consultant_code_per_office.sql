-- Allow the same asesor code in different offices (unique per office).
DROP INDEX IF EXISTS consultant_code_unique;

CREATE UNIQUE INDEX IF NOT EXISTS consultant_code_per_office_unique
    ON consultant (office_id, consultant_code)
    WHERE consultant_code IS NOT NULL;
