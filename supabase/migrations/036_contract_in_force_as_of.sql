-- «En vigor» from the insurer means the póliza is up to date with its payments.
--   * contract.in_force_as_of: date the insurer reported the póliza en vigor (Mina de Oro cut-off,
--     plantilla import day, or rehabilitation day). Receipts due on or before it count as paid,
--     so the next due is the first receipt after it (unless a later payment moves it further).
--   * contract_next_due(): next_collection_due() + that coverage; used by the at-risk / pending
--     lists, Vista general and contract_cartera_rows (Pólizas, Clientes, Asesores, Cobranza board).
--
-- Existing data: the column starts NULL for every póliza (no reliable source to backfill it), so
-- nothing changes until the next Mina de Oro / plantilla import (which sets it for every póliza
-- en vigor in the file) or a rehabilitation. Nothing is dropped or rewritten.

ALTER TABLE public.contract ADD COLUMN IF NOT EXISTS in_force_as_of date;

COMMENT ON COLUMN public.contract.in_force_as_of IS
  'Date the insurer reported the póliza en vigor (Mina de Oro cut-off / import / rehabilitation). Receipts due on or before it count as paid.';

CREATE OR REPLACE FUNCTION public.contract_next_due(
  issue_date date,
  last_paid date,
  payment_method text,
  collection_day integer,
  in_force_as_of date
)
RETURNS date
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  -- GREATEST ignores NULLs: without in_force_as_of this is next_collection_due()
  SELECT GREATEST(
    public.next_collection_due(issue_date, last_paid, payment_method, collection_day),
    CASE
      WHEN in_force_as_of IS NULL THEN NULL
      -- No calendar: one period after the confirmation
      WHEN issue_date IS NULL THEN public.next_due_from_last_payment(in_force_as_of, payment_method, collection_day)
      -- A payment covers receipts due up to payment + 15 days: shift back so the confirmation
      -- covers receipts due on or before in_force_as_of exactly
      ELSE public.next_collection_due(issue_date, in_force_as_of - 15, payment_method, collection_day)
    END
  );
$$;

COMMENT ON FUNCTION public.contract_next_due(date, date, text, integer, date) IS
  'Next receipt due: receipt calendar after the last payment, and never on or before the insurer «en vigor» date.';

REVOKE ALL ON FUNCTION public.contract_next_due(date, date, text, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contract_next_due(date, date, text, integer, date) TO authenticated, service_role;

-- Same functions as 035, next due through contract_next_due ---------------------------

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
      c.in_force_as_of AS as_of,
      public.contract_last_known_payment(c.id) AS last_paid
    FROM public.contract c
    JOIN public.consultant cons ON cons.id = c.consultant_id
    LEFT JOIN public.client cl ON cl.id = c.client_id
    WHERE c.status = 'IN_FORCE'
      AND (office_id_param IS NULL OR c.office_id = office_id_param)
      AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
  ),
  due AS (
    SELECT
      b.*,
      public.contract_next_due(
        b.issue_d,
        b.last_paid,
        b.pm,
        b.cday::integer,
        b.as_of
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL OR b.issue_d IS NOT NULL OR b.as_of IS NOT NULL
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
      c.in_force_as_of AS as_of,
      public.contract_last_known_payment(c.id) AS last_paid
    FROM public.contract c
    JOIN public.consultant cons ON cons.id = c.consultant_id
    LEFT JOIN public.client cl ON cl.id = c.client_id
    WHERE c.status = 'IN_FORCE'
      AND (office_id_param IS NULL OR c.office_id = office_id_param)
      AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
  ),
  due AS (
    SELECT
      b.*,
      public.contract_next_due(
        b.issue_d,
        b.last_paid,
        b.pm,
        b.cday::integer,
        b.as_of
      ) AS due_d
    FROM base b
    WHERE b.last_paid IS NOT NULL OR b.issue_d IS NOT NULL OR b.as_of IS NOT NULL
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
        SELECT c.id, c.consultant_id, c.status, c.payment_method, c.collection_day, c.issue_date, c.in_force_as_of
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
                -- Receipt calendar from FECHA EMISION; last payment = latest mark or FECHA PAGO;
                -- receipts up to the insurer's «en vigor» date count as paid
                public.contract_next_due(
                    s.issue_date,
                    GREATEST(lm.paid, ld.paid),
                    s.payment_method,
                    s.collection_day::integer,
                    s.in_force_as_of
                ) AS due_d
            FROM scoped s
            LEFT JOIN last_mark lm ON lm.contract_id = s.id
            LEFT JOIN last_detail ld ON ld.contract_id = s.id
            WHERE s.status = 'IN_FORCE'
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

CREATE OR REPLACE FUNCTION public.contract_cartera_rows(
    office_id_param uuid,
    consultant_id_param uuid,
    risk_days integer,
    due_soon_days integer
)
RETURNS TABLE (
    contract_id uuid,
    contract_number text,
    client_id uuid,
    client_name text,
    consultant_id uuid,
    consultant_name text,
    currency text,
    payment_method text,
    issue_date date,
    status text,
    next_due date,
    days_past_due integer,
    cartera_status text
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
    WITH scoped AS (
        SELECT
            c.id,
            c.contract_number,
            c.client_id,
            cl.name AS client_name,
            c.consultant_id,
            cons.name AS consultant_name,
            c.currency,
            c.payment_method,
            c.issue_date,
            c.status,
            c.collection_day,
            c.in_force_as_of
        FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        LEFT JOIN client cl ON cl.id = c.client_id
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
    with_due AS (
        SELECT
            s.*,
            CASE WHEN s.status = 'IN_FORCE' THEN
                public.contract_next_due(
                    s.issue_date,
                    GREATEST(lm.paid, ld.paid),
                    s.payment_method,
                    s.collection_day::integer,
                    s.in_force_as_of
                )
            END AS due
        FROM scoped s
        LEFT JOIN last_mark lm ON lm.contract_id = s.id
        LEFT JOIN last_detail ld ON ld.contract_id = s.id
    )
    SELECT
        w.id,
        w.contract_number::text,
        w.client_id,
        w.client_name::text,
        w.consultant_id,
        w.consultant_name::text,
        w.currency::text,
        w.payment_method::text,
        w.issue_date::date,
        w.status::text,
        w.due,
        CASE WHEN w.due IS NOT NULL THEN (CURRENT_DATE - w.due)::integer END,
        CASE
            WHEN w.status IS DISTINCT FROM 'IN_FORCE' THEN 'inactive'
            WHEN w.due IS NULL THEN 'no_payment'
            WHEN CURRENT_DATE - w.due > risk_days THEN 'at_risk'
            WHEN w.due < CURRENT_DATE THEN 'overdue'
            WHEN w.due - CURRENT_DATE <= due_soon_days THEN 'due_soon'
            ELSE 'current'
        END
    FROM with_due w;
$$;
