-- Next collection date from the póliza's receipt calendar (FECHA EMISION + forma de pago),
-- not from "last payment + period". Example: emisión 20/dic, Trimestral → recibos dic, mar,
-- jun, sep (día 20). Last payment 21/jul (jun receipt paid late) → next due 20/sep.
-- A payment covers the latest receipt due on or before payment date + 15 days
-- (so a receipt paid up to 15 days early counts for that receipt).
-- Without issue_date the old rule (last payment + period) still applies.

-- Due date of receipt k (0 = emission) for a póliza.
CREATE OR REPLACE FUNCTION public.collection_receipt_due(issue_date date, step_months integer, k integer)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.month_due_date(
    EXTRACT(YEAR FROM (date_trunc('month', issue_date) + make_interval(months => k * step_months)))::integer,
    EXTRACT(MONTH FROM (date_trunc('month', issue_date) + make_interval(months => k * step_months)))::integer,
    EXTRACT(DAY FROM issue_date)::integer
  );
$$;

CREATE OR REPLACE FUNCTION public.next_collection_due(
  issue_date date,
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
  step integer;
  ref date;
  months integer;
  k integer;
BEGIN
  IF issue_date IS NULL THEN
    RETURN public.next_due_from_last_payment(last_paid, payment_method, collection_day);
  END IF;
  IF last_paid IS NULL THEN
    RETURN issue_date; -- first receipt still unpaid
  END IF;

  step := public.payment_method_step_months(payment_method);
  ref := last_paid + 15; -- early-payment window
  months := (EXTRACT(YEAR FROM ref)::integer - EXTRACT(YEAR FROM issue_date)::integer) * 12
          + EXTRACT(MONTH FROM ref)::integer - EXTRACT(MONTH FROM issue_date)::integer;
  k := floor(months::numeric / step)::integer;
  IF public.collection_receipt_due(issue_date, step, k) > ref THEN
    k := k - 1;
  END IF;
  IF k < 0 THEN
    RETURN issue_date;
  END IF;
  RETURN public.collection_receipt_due(issue_date, step, k + 1);
END;
$$;

COMMENT ON FUNCTION public.next_collection_due(date, date, text, integer) IS
  'Next receipt due from FECHA EMISION + forma de pago after the last payment (15-day early window); falls back to next_due_from_last_payment without issue_date.';

REVOKE ALL ON FUNCTION public.collection_receipt_due(date, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.next_collection_due(date, date, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.collection_receipt_due(date, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_collection_due(date, date, text, integer) TO authenticated, service_role;

-- Lists and Vista general use the receipt calendar

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
      c.issue_date AS issue_d,
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
      public.next_collection_due(
        b.issue_d,
        b.last_paid,
        b.pm,
        b.cday::integer
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL OR b.issue_d IS NOT NULL
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
      c.issue_date AS issue_d,
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
      public.next_collection_due(
        b.issue_d,
        b.last_paid,
        b.pm,
        b.cday::integer
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL OR b.issue_d IS NOT NULL
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

CREATE OR REPLACE FUNCTION public.get_collection_overview(
    office_id_param uuid DEFAULT NULL,
    consultant_id_param uuid DEFAULT NULL,
    risk_days integer DEFAULT 30,
    due_soon_days integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := CURRENT_DATE;
    v_month_start date := date_trunc('month', CURRENT_DATE)::date;
    v_prev_month_start date := (date_trunc('month', CURRENT_DATE) - interval '1 month')::date;
    v_prev_same_day date;
    v_year integer := EXTRACT(YEAR FROM CURRENT_DATE)::integer;
    v_result jsonb;
BEGIN
    IF office_id_param IS NULL AND consultant_id_param IS NULL THEN
        RAISE EXCEPTION 'office_id_param or consultant_id_param required';
    END IF;
    IF office_id_param IS NOT NULL AND NOT public.caller_can_access_office(office_id_param) THEN
        RAISE EXCEPTION 'Not authorized for office';
    END IF;
    IF consultant_id_param IS NOT NULL AND NOT public.caller_can_access_consultant(consultant_id_param) THEN
        RAISE EXCEPTION 'Not authorized for consultant';
    END IF;
    IF risk_days IS NULL OR risk_days < 1 THEN
        risk_days := 30;
    END IF;
    IF due_soon_days IS NULL OR due_soon_days < 0 THEN
        due_soon_days := 15;
    END IF;

    -- Same elapsed days of the previous month (fair month-to-date comparison)
    v_prev_same_day := LEAST(v_prev_month_start + (v_today - v_month_start), v_month_start - 1);

    WITH scoped AS (
        -- Every póliza in scope (payment history keeps inactive ones)
        SELECT c.id, c.consultant_id, c.status, c.payment_method, c.collection_day, c.issue_date
        FROM contract c
        WHERE (office_id_param IS NULL OR c.office_id = office_id_param)
          AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
    ),
    last_mark AS (
        SELECT p.contract_id, MAX(p.paid_at::date) AS paid
        FROM contract_collection_payment p
        JOIN scoped s ON s.id = p.contract_id
        WHERE p.paid_at IS NOT NULL
        GROUP BY p.contract_id
    ),
    last_detail AS (
        SELECT d.contract_id, MAX(d.payment_date) AS paid
        FROM contract_detail d
        JOIN scoped s ON s.id = d.contract_id
        WHERE d.payment_date IS NOT NULL
        GROUP BY d.contract_id
    ),
    classified AS (
        SELECT
            x.*,
            CASE
                WHEN x.due_d IS NULL THEN 'no_payment'
                WHEN v_today - x.due_d > risk_days THEN 'at_risk'
                WHEN x.due_d < v_today THEN 'overdue'
                WHEN x.due_d - v_today <= due_soon_days THEN 'due_soon'
                ELSE 'current'
            END AS bucket
        FROM (
            SELECT
                s.id,
                s.consultant_id,
                s.payment_method,
                -- Receipt calendar from FECHA EMISION; last payment = latest mark or FECHA PAGO
                public.next_collection_due(
                    s.issue_date,
                    GREATEST(lm.paid, ld.paid),
                    s.payment_method,
                    s.collection_day::integer
                ) AS due_d
            FROM scoped s
            LEFT JOIN last_mark lm ON lm.contract_id = s.id
            LEFT JOIN last_detail ld ON ld.contract_id = s.id
            WHERE s.status IS DISTINCT FROM 'INACTIVE'
        ) AS x
    ),
    payments AS (
        SELECT p.paid_at::date AS paid
        FROM contract_collection_payment p
        JOIN scoped s ON s.id = p.contract_id
        WHERE p.paid_at IS NOT NULL
          AND p.paid_at::date >= make_date(v_year - 1, 1, 1)
          AND p.paid_at::date <= v_today
    ),
    monthly AS (
        SELECT
            EXTRACT(YEAR FROM paid)::integer AS y,
            EXTRACT(MONTH FROM paid)::integer AS m,
            count(*)::integer AS n
        FROM payments
        GROUP BY 1, 2
    ),
    per_consultant AS (
        SELECT
            k.consultant_id,
            cons.name,
            count(*)::integer AS total,
            count(*) FILTER (WHERE k.bucket = 'current')::integer AS current,
            count(*) FILTER (WHERE k.bucket = 'due_soon')::integer AS due_soon,
            count(*) FILTER (WHERE k.bucket = 'overdue')::integer AS overdue,
            count(*) FILTER (WHERE k.bucket = 'at_risk')::integer AS at_risk,
            count(*) FILTER (WHERE k.bucket = 'no_payment')::integer AS no_payment
        FROM classified k
        JOIN consultant cons ON cons.id = k.consultant_id
        GROUP BY k.consultant_id, cons.name
    )
    SELECT jsonb_build_object(
        'today', v_today,
        'risk_days', risk_days,
        'due_soon_days', due_soon_days,
        'active_contracts', (SELECT count(*) FROM classified),
        'status', (
            SELECT jsonb_build_object(
                'current', count(*) FILTER (WHERE bucket = 'current'),
                'due_soon', count(*) FILTER (WHERE bucket = 'due_soon'),
                'overdue', count(*) FILTER (WHERE bucket = 'overdue'),
                'at_risk', count(*) FILTER (WHERE bucket = 'at_risk'),
                'no_payment', count(*) FILTER (WHERE bucket = 'no_payment')
            )
            FROM classified
        ),
        'due_today', (SELECT count(*) FROM classified WHERE due_d = v_today),
        'due_next_7_days', (SELECT count(*) FROM classified WHERE due_d BETWEEN v_today AND v_today + 6),
        'missing_payment_method', (
            SELECT count(*) FROM classified
            WHERE payment_method IS NULL OR btrim(payment_method) = ''
        ),
        'aging', (
            SELECT jsonb_build_object(
                'd1_10', count(*) FILTER (WHERE v_today - due_d BETWEEN 1 AND 10),
                'd11_20', count(*) FILTER (WHERE v_today - due_d BETWEEN 11 AND 20),
                'd21_30', count(*) FILTER (WHERE v_today - due_d BETWEEN 21 AND 30),
                'd31_60', count(*) FILTER (WHERE v_today - due_d BETWEEN 31 AND 60),
                'd61_90', count(*) FILTER (WHERE v_today - due_d BETWEEN 61 AND 90),
                'd90_plus', count(*) FILTER (WHERE v_today - due_d > 90)
            )
            FROM classified
            WHERE due_d < v_today
        ),
        'payments_month_to_date', (
            SELECT count(*) FROM payments WHERE paid BETWEEN v_month_start AND v_today
        ),
        'payments_prev_month_to_date', (
            SELECT count(*) FROM payments WHERE paid BETWEEN v_prev_month_start AND v_prev_same_day
        ),
        'monthly_payments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object('year', y, 'month', m, 'count', n) ORDER BY y, m)
            FROM monthly
        ), '[]'::jsonb),
        'by_consultant', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'consultant_id', consultant_id,
                    'name', name,
                    'total', total,
                    'current', current,
                    'due_soon', due_soon,
                    'overdue', overdue,
                    'at_risk', at_risk,
                    'no_payment', no_payment
                )
                ORDER BY at_risk + overdue DESC, total DESC, name
            )
            FROM per_consultant
        ), '[]'::jsonb),
        -- Asesor invitations (office view only)
        'consultants_not_invited', CASE WHEN consultant_id_param IS NULL THEN (
            SELECT count(*) FROM consultant WHERE office_id = office_id_param AND status = 'NOT_INVITED'
        ) END,
        'consultants_pending_invite', CASE WHEN consultant_id_param IS NULL THEN (
            SELECT count(*) FROM consultant WHERE office_id = office_id_param AND status = 'PENDING'
        ) END
    )
    INTO v_result;

    RETURN v_result;
END;
$$;
