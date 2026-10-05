-- At-risk threshold: 30 days (was 45).

CREATE OR REPLACE FUNCTION public.list_contracts_at_risk(
  office_id_param uuid DEFAULT NULL,
  consultant_id_param uuid DEFAULT NULL,
  risk_days integer DEFAULT 30,
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
    risk_days := 30;
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

COMMENT ON FUNCTION public.list_contracts_at_risk(uuid, uuid, integer, integer) IS
  'Policies unpaid more than risk_days (default 30) after expected collection date';
