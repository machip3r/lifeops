-- Align Vista general risk/pending RPCs with Cobranza:
-- next due = last known payment + forma de pago (+ collection_day).
-- Drop the old "every unpaid month in lookback" heuristic that flagged
-- almost all policies after importing an old commission file.

CREATE OR REPLACE FUNCTION public.payment_method_step_months(payment_method text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN payment_method IS NULL OR btrim(payment_method) = '' THEN 1
    WHEN lower(btrim(payment_method)) ~ '^(anual|1|01)(\b|[^a-z0-9]|$)' THEN 12
    WHEN lower(btrim(payment_method)) ~ '^(semestral|2|02)(\b|[^a-z0-9]|$)' THEN 6
    WHEN lower(btrim(payment_method)) ~ '^(trimestral|4|04)(\b|[^a-z0-9]|$)' THEN 3
    WHEN lower(btrim(payment_method)) ~ '^(mensual|5|05)(\b|[^a-z0-9]|$)' THEN 1
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.payment_method_step_months(text) IS
  'Months to step for next collection (Mensual=1, Trimestral=3, Semestral=6, Anual=12).';

REVOKE ALL ON FUNCTION public.payment_method_step_months(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_method_step_months(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_method_step_months(text) TO service_role;

-- Mirror src/lib/collections/next-due.ts → nextDueFromLastPayment
CREATE OR REPLACE FUNCTION public.next_due_from_last_payment(
  last_paid date,
  payment_method text,
  collection_day integer DEFAULT NULL
)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  months integer;
  stepped date;
  day_of_month integer;
BEGIN
  IF last_paid IS NULL THEN
    RETURN NULL;
  END IF;

  months := public.payment_method_step_months(payment_method);
  stepped := (last_paid + make_interval(months => months))::date;

  IF collection_day IS NOT NULL AND collection_day BETWEEN 1 AND 31 THEN
    day_of_month := collection_day;
  ELSE
    day_of_month := EXTRACT(DAY FROM stepped)::integer;
  END IF;

  RETURN public.month_due_date(
    EXTRACT(YEAR FROM stepped)::integer,
    EXTRACT(MONTH FROM stepped)::integer,
    day_of_month
  );
END;
$$;

COMMENT ON FUNCTION public.next_due_from_last_payment(date, text, integer) IS
  'Next collection date after last known payment (same rule as Cobranza).';

REVOKE ALL ON FUNCTION public.next_due_from_last_payment(date, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_due_from_last_payment(date, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_due_from_last_payment(date, text, integer) TO service_role;

-- Latest paid_at mark, else latest FECHA PAGO from contract_detail (Cobranza fallback).
CREATE OR REPLACE FUNCTION public.contract_last_known_payment(contract_id_param uuid)
RETURNS date
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT MAX(v)
  FROM (
    SELECT MAX(p.paid_at::date) AS v
    FROM public.contract_collection_payment p
    WHERE p.contract_id = contract_id_param
      AND p.paid_at IS NOT NULL
    UNION ALL
    SELECT MAX(d.payment_date::date) AS v
    FROM public.contract_detail d
    WHERE d.contract_id = contract_id_param
      AND d.payment_date IS NOT NULL
  ) AS src;
$$;

COMMENT ON FUNCTION public.contract_last_known_payment(uuid) IS
  'Latest known payment date: collection mark paid_at, else contract_detail.payment_date.';

REVOKE ALL ON FUNCTION public.contract_last_known_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.contract_last_known_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.contract_last_known_payment(uuid) TO service_role;

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
  -- lookback_months kept for API compatibility; unused (next-due model).
  IF risk_days IS NULL OR risk_days < 1 THEN
    risk_days := 30;
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
  WITH base AS (
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
      c.payment_method AS pm,
      public.contract_last_known_payment(c.id) AS last_paid
    FROM public.contract c
    JOIN public.consultant cons ON cons.id = c.consultant_id
    LEFT JOIN public.client cl ON cl.id = c.client_id
    WHERE c.status IS DISTINCT FROM 'INACTIVE'
      AND (office_id_param IS NULL OR c.office_id = office_id_param)
      AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
  ),
  due AS (
    SELECT
      b.*,
      public.next_due_from_last_payment(
        b.last_paid,
        b.pm,
        b.cday::integer
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL
  )
  SELECT
    d.cid,
    d.oid,
    d.cons_id,
    d.clid,
    d.cnum,
    d.cname,
    d.cons_name,
    d.cday,
    d.due_d,
    (CURRENT_DATE - d.due_d)::integer AS days_od,
    d.cstatus
  FROM due d
  WHERE d.due_d IS NOT NULL
    AND d.due_d < CURRENT_DATE
    AND (CURRENT_DATE - d.due_d) > risk_days
  ORDER BY days_od DESC, d.cnum NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.list_contracts_at_risk(uuid, uuid, integer, integer) IS
  'Policies whose next due (from last known payment + forma de pago) is more than risk_days overdue.';

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
  risk_days integer := 30;
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
  WITH base AS (
    SELECT
      c.id AS cid,
      c.office_id AS oid,
      c.consultant_id AS cons_id,
      c.client_id AS clid,
      c.contract_number AS cnum,
      cl.name AS cname,
      cons.name AS cons_name,
      c.collection_day AS cday,
      c.payment_method AS pm,
      public.contract_last_known_payment(c.id) AS last_paid
    FROM public.contract c
    JOIN public.consultant cons ON cons.id = c.consultant_id
    LEFT JOIN public.client cl ON cl.id = c.client_id
    WHERE c.status IS DISTINCT FROM 'INACTIVE'
      AND (office_id_param IS NULL OR c.office_id = office_id_param)
      AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
  ),
  due AS (
    SELECT
      b.*,
      public.next_due_from_last_payment(
        b.last_paid,
        b.pm,
        b.cday::integer
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL
  )
  SELECT
    d.cid,
    d.oid,
    d.cons_id,
    d.clid,
    d.cnum,
    d.cname,
    d.cons_name,
    d.cday,
    d.due_d,
    (d.due_d - CURRENT_DATE)::integer AS days_until,
    d.due_d < CURRENT_DATE AS overdue
  FROM due d
  WHERE d.due_d IS NOT NULL
    -- Upcoming within horizon, or overdue but not yet "en peligro"
    AND d.due_d <= CURRENT_DATE + within_days
    AND (CURRENT_DATE - d.due_d) <= risk_days
  ORDER BY d.due_d ASC, d.cnum NULLS LAST;
END;
$$;

COMMENT ON FUNCTION public.list_contracts_pending_payment(uuid, uuid, integer) IS
  'Policies whose next due (from last known payment) is within within_days, excluding at-risk (>30 days overdue).';
