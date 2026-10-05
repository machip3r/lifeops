-- Hybrid client identity (CURP/RFC or office-local) + denormalized contract.office_id.

-- ============================================
-- 1. client: CURP / RFC
-- ============================================
ALTER TABLE client
  ADD COLUMN IF NOT EXISTS curp TEXT,
  ADD COLUMN IF NOT EXISTS rfc TEXT;

COMMENT ON COLUMN client.curp IS 'Mexican CURP when known; unique globally for future client login';
COMMENT ON COLUMN client.rfc IS 'Mexican RFC when known; unique globally';

-- Empty strings → NULL for uniqueness
UPDATE client SET curp = NULL WHERE curp IS NOT NULL AND length(trim(curp)) = 0;
UPDATE client SET rfc = NULL WHERE rfc IS NOT NULL AND length(trim(rfc)) = 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_curp_unique
  ON client (upper(trim(curp)))
  WHERE curp IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_client_rfc_unique
  ON client (upper(trim(rfc)))
  WHERE rfc IS NOT NULL;

-- Backfill office_id from a linked contract when missing
UPDATE client cl
SET office_id = sub.office_id
FROM (
  SELECT DISTINCT ON (c.client_id)
    c.client_id,
    cons.office_id
  FROM contract c
  JOIN consultant cons ON cons.id = c.consultant_id
  WHERE c.client_id IS NOT NULL
  ORDER BY c.client_id, c.created_at ASC NULLS LAST
) sub
WHERE cl.id = sub.client_id
  AND cl.office_id IS NULL;

-- Hybrid scope: local-by-office OR strong id (CURP/RFC)
ALTER TABLE client DROP CONSTRAINT IF EXISTS client_identity_scope_check;
ALTER TABLE client ADD CONSTRAINT client_identity_scope_check
  CHECK (
    office_id IS NOT NULL
    OR curp IS NOT NULL
    OR rfc IS NOT NULL
  );

-- ============================================
-- 2. contract: denormalized office_id
-- ============================================
ALTER TABLE contract
  ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES office (id) ON DELETE CASCADE;

UPDATE contract co
SET office_id = cons.office_id
FROM consultant cons
WHERE cons.id = co.consultant_id
  AND co.office_id IS NULL;

-- Orphan contracts without consultant office cannot be tenancy-scoped — remove if any
DELETE FROM contract WHERE office_id IS NULL;

ALTER TABLE contract
  ALTER COLUMN office_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_office_id ON contract (office_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_office_contract_number
  ON contract (office_id, contract_number)
  WHERE contract_number IS NOT NULL AND length(trim(contract_number)) > 0;

-- Keep office_id aligned with consultant on insert/update
CREATE OR REPLACE FUNCTION public.sync_contract_office_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  SELECT office_id INTO NEW.office_id
  FROM consultant
  WHERE id = NEW.consultant_id;

  IF NEW.office_id IS NULL THEN
    RAISE EXCEPTION 'consultant % has no office_id', NEW.consultant_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_contract_office_id ON contract;
CREATE TRIGGER trg_sync_contract_office_id
  BEFORE INSERT OR UPDATE OF consultant_id ON contract
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contract_office_id();
