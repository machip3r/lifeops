-- Commission import batches, contract source/issue_date, payment evidence link, at-risk RPC.

-- ============================================
-- 1. contract source + issue_date
-- ============================================
ALTER TABLE contract
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('import', 'manual', 'mixed')),
  ADD COLUMN IF NOT EXISTS issue_date DATE;

COMMENT ON COLUMN contract.source IS 'How the contract entered LifeOps: import, manual, or both over time';
COMMENT ON COLUMN contract.issue_date IS 'Policy issue/emission date when known';
COMMENT ON COLUMN contract.collection_day IS 'Agreed day-of-month for cobro (may differ from issue day)';

CREATE INDEX IF NOT EXISTS idx_contract_source ON contract (source);
CREATE INDEX IF NOT EXISTS idx_contract_issue_date ON contract (issue_date);

-- ============================================
-- 2. commission_import (batch per upload)
-- ============================================
CREATE TABLE IF NOT EXISTS commission_import (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  file_name TEXT,
  file_path TEXT,
  file_type TEXT,
  file_size INTEGER,
  -- Emission date of the commission file (required for risk / reminders)
  issue_date DATE NOT NULL,
  -- Prior payment / collection date prompted when creating first-time policies
  prior_payment_date DATE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'preview', 'imported', 'failed')),
  row_count INTEGER,
  contracts_created INTEGER DEFAULT 0,
  contracts_updated INTEGER DEFAULT 0,
  payments_marked INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_import_office_id ON commission_import (office_id);
CREATE INDEX IF NOT EXISTS idx_commission_import_created_at ON commission_import (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commission_import_issue_date ON commission_import (issue_date);

DROP TRIGGER IF EXISTS update_commission_import_updated_at ON commission_import;
CREATE TRIGGER update_commission_import_updated_at
  BEFORE UPDATE ON commission_import
  FOR EACH ROW
  EXECUTE FUNCTION handle_updated_at();

ALTER TABLE commission_import ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office can manage own commission imports" ON commission_import;
CREATE POLICY "Office can manage own commission imports" ON commission_import
FOR ALL TO authenticated
USING (office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid())))
WITH CHECK (office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Consultants can view office commission imports" ON commission_import;
CREATE POLICY "Consultants can view office commission imports" ON commission_import
FOR SELECT TO authenticated
USING (
  office_id IN (
    SELECT office_id FROM consultant
    WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON commission_import TO authenticated;

-- ============================================
-- 3. Link details / payments to import batch
-- ============================================
ALTER TABLE contract_detail
  ADD COLUMN IF NOT EXISTS commission_import_id UUID REFERENCES commission_import (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contract_detail_commission_import_id
  ON contract_detail (commission_import_id);

ALTER TABLE contract_collection_payment
  ADD COLUMN IF NOT EXISTS commission_import_id UUID REFERENCES commission_import (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ccp_commission_import_id
  ON contract_collection_payment (commission_import_id);

-- ============================================
-- 4. Payment evidence via file → collection payment
-- ============================================
ALTER TABLE file
  ADD COLUMN IF NOT EXISTS collection_payment_id UUID
    REFERENCES contract_collection_payment (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_file_collection_payment_id
  ON file (collection_payment_id);

COMMENT ON COLUMN file.collection_payment_id IS 'Optional link when file is payment evidence for a cobranza month mark';

-- ============================================
-- 5. Helper: last day of month
-- ============================================
CREATE OR REPLACE FUNCTION public.month_due_date(y integer, m integer, day_of_month integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT make_date(
    y,
    m,
    LEAST(
      day_of_month,
      EXTRACT(DAY FROM (make_date(y, m, 1) + INTERVAL '1 month - 1 day'))::integer
    )
  );
$$;

REVOKE ALL ON FUNCTION public.month_due_date(integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.month_due_date(integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.month_due_date(integer, integer, integer) TO service_role;

-- ============================================
-- 6. Contracts at risk (> risk_days after expected cobro without paid_at)
-- ============================================
CREATE OR REPLACE FUNCTION public.list_contracts_at_risk(
  office_id_param uuid DEFAULT NULL,
  consultant_id_param uuid DEFAULT NULL,
  risk_days integer DEFAULT 45,
  lookback_months integer DEFAULT 12
)
RETURNS TABLE (
  contract_id uuid,
  office_id uuid,
  consultant_id uuid,
  client_id uuid,
  contract_number text,
  client_name text,
  consultant_name text,
  collection_day smallint,
  due_date date,
  days_overdue integer,
  collection_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF risk_days IS NULL OR risk_days < 1 THEN
    risk_days := 45;
  END IF;
  IF lookback_months IS NULL OR lookback_months < 1 THEN
    lookback_months := 12;
  END IF;

  IF office_id_param IS NOT NULL AND NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for office';
  END IF;
  IF consultant_id_param IS NOT NULL AND NOT public.caller_can_access_consultant(consultant_id_param) THEN
    RAISE EXCEPTION 'Not authorized for consultant';
  END IF;
  IF office_id_param IS NULL AND consultant_id_param IS NULL THEN
    RAISE EXCEPTION 'office_id_param or consultant_id_param required';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT
      (date_trunc('month', CURRENT_DATE) - (g || ' months')::interval)::date AS month_start
    FROM generate_series(0, lookback_months - 1) AS g
  ),
  base AS (
    SELECT
      c.id AS cid,
      c.office_id AS oid,
      c.consultant_id AS cons_id,
      c.client_id AS clid,
      c.contract_number AS cnum,
      cl.name AS cname,
      cons.name AS cons_name,
      c.collection_day AS cday,
      c.collection_status AS cstatus,
      COALESCE(
        c.collection_day,
        (
          SELECT ccp.scheduled_day
          FROM contract_collection_payment ccp
          WHERE ccp.contract_id = c.id
            AND ccp.scheduled_day IS NOT NULL
          ORDER BY ccp.year DESC, ccp.month DESC
          LIMIT 1
        )
      ) AS due_day
    FROM contract c
    JOIN consultant cons ON cons.id = c.consultant_id
    LEFT JOIN client cl ON cl.id = c.client_id
    WHERE c.status IS DISTINCT FROM 'INACTIVE'
      AND (office_id_param IS NULL OR c.office_id = office_id_param)
      AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
  ),
  candidates AS (
    SELECT
      b.*,
      public.month_due_date(
        EXTRACT(YEAR FROM m.month_start)::integer,
        EXTRACT(MONTH FROM m.month_start)::integer,
        b.due_day::integer
      ) AS due_d,
      EXISTS (
        SELECT 1
        FROM contract_collection_payment p
        WHERE p.contract_id = b.cid
          AND p.year = EXTRACT(YEAR FROM m.month_start)::integer
          AND p.month = EXTRACT(MONTH FROM m.month_start)::integer
          AND p.paid_at IS NOT NULL
      ) AS is_paid
    FROM base b
    CROSS JOIN months m
    WHERE b.due_day IS NOT NULL
  ),
  overdue AS (
    SELECT
      c.cid,
      c.oid,
      c.cons_id,
      c.clid,
      c.cnum,
      c.cname,
      c.cons_name,
      c.cday,
      c.due_d,
      (CURRENT_DATE - c.due_d)::integer AS days_od,
      c.cstatus
    FROM candidates c
    WHERE c.is_paid = false
      AND c.due_d < CURRENT_DATE
      AND (CURRENT_DATE - c.due_d) > risk_days
  ),
  best AS (
    SELECT DISTINCT ON (o.cid)
      o.*
    FROM overdue o
    ORDER BY o.cid, o.due_d ASC
  )
  SELECT
    b.cid,
    b.oid,
    b.cons_id,
    b.clid,
    b.cnum,
    b.cname,
    b.cons_name,
    b.cday,
    b.due_d,
    b.days_od,
    b.cstatus
  FROM best b
  ORDER BY b.days_od DESC, b.cnum NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_contracts_at_risk(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_contracts_at_risk(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_contracts_at_risk(uuid, uuid, integer, integer) TO service_role;

-- ============================================
-- 7. Pending collection marks (current month unpaid / due soon)
-- ============================================
CREATE OR REPLACE FUNCTION public.list_contracts_pending_payment(
  office_id_param uuid DEFAULT NULL,
  consultant_id_param uuid DEFAULT NULL,
  within_days integer DEFAULT 15
)
RETURNS TABLE (
  contract_id uuid,
  office_id uuid,
  consultant_id uuid,
  client_id uuid,
  contract_number text,
  client_name text,
  consultant_name text,
  collection_day smallint,
  due_date date,
  days_until_due integer,
  is_overdue boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  y integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
  m integer := EXTRACT(MONTH FROM CURRENT_DATE)::integer;
BEGIN
  IF within_days IS NULL OR within_days < 0 THEN
    within_days := 15;
  END IF;

  IF office_id_param IS NOT NULL AND NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for office';
  END IF;
  IF consultant_id_param IS NOT NULL AND NOT public.caller_can_access_consultant(consultant_id_param) THEN
    RAISE EXCEPTION 'Not authorized for consultant';
  END IF;
  IF office_id_param IS NULL AND consultant_id_param IS NULL THEN
    RAISE EXCEPTION 'office_id_param or consultant_id_param required';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.office_id,
    c.consultant_id,
    c.client_id,
    c.contract_number,
    cl.name,
    cons.name,
    c.collection_day,
    public.month_due_date(y, m, COALESCE(c.collection_day, 1)::integer) AS due_d,
    (public.month_due_date(y, m, COALESCE(c.collection_day, 1)::integer) - CURRENT_DATE)::integer AS days_until,
    public.month_due_date(y, m, COALESCE(c.collection_day, 1)::integer) < CURRENT_DATE AS overdue
  FROM contract c
  JOIN consultant cons ON cons.id = c.consultant_id
  LEFT JOIN client cl ON cl.id = c.client_id
  WHERE c.status IS DISTINCT FROM 'INACTIVE'
    AND c.collection_day IS NOT NULL
    AND (office_id_param IS NULL OR c.office_id = office_id_param)
    AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
    AND NOT EXISTS (
      SELECT 1
      FROM contract_collection_payment p
      WHERE p.contract_id = c.id
        AND p.year = y
        AND p.month = m
        AND p.paid_at IS NOT NULL
    )
    AND (
      public.month_due_date(y, m, c.collection_day::integer) <= CURRENT_DATE + within_days
    )
  ORDER BY due_d ASC, c.contract_number NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.list_contracts_pending_payment(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_contracts_pending_payment(uuid, uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_contracts_pending_payment(uuid, uuid, integer) TO service_role;
