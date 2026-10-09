-- Asesores created on import without an invitation stay NOT_INVITED
-- until the office sends the invite (then PENDING → ACTIVE).

DO $$
DECLARE
  constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT con.conname
    FROM pg_constraint AS con
    JOIN pg_class AS rel ON rel.oid = con.conrelid
    JOIN pg_namespace AS nsp ON nsp.oid = rel.relnamespace
    WHERE
      nsp.nspname = 'public'
      AND rel.relname = 'consultant'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
  LOOP
    EXECUTE format(
      'ALTER TABLE consultant DROP CONSTRAINT %I',
      constraint_name
    );
  END LOOP;
END $$;

ALTER TABLE consultant
    ADD CONSTRAINT consultant_status_check CHECK (
        status IN (
            'ACTIVE',
            'INACTIVE',
            'PENDING',
            'NOT_INVITED'
        )
    );

-- Pending rows that never received an invitation token.
UPDATE consultant AS c
SET
    status = 'NOT_INVITED',
    updated_at = NOW()
WHERE
    c.status = 'PENDING'
    AND NOT EXISTS (
        SELECT 1
        FROM token AS t
        WHERE
            t.type = 'CONSULTANT_INVITATION'
            AND (
                (
                    c.email IS NOT NULL
                    AND lower(t.metadata ->> 'consultant_email') = lower(c.email)
                )
                OR (
                    c.consultant_code IS NOT NULL
                    AND t.metadata ->> 'consultant_code' = c.consultant_code
                    AND t.metadata ->> 'office_id' = c.office_id::text
                )
            )
    );
