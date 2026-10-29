-- Póliza status as the insurer reports it, instead of ACTIVE / INACTIVE / PENDING:
--   IN_FORCE (en vigor) · EXTENDED (en vigor prorrogado) · NO_PREMIUMS (en vigor sin pago de primas)
--   · ANNULLED (anulada). Only IN_FORCE pólizas are in cobranza (next due, buckets, board, lists);
--   an anulada póliza is rehabilitated by setting it back to IN_FORCE.
--   * contract.status: data mapped (ACTIVE / PENDING → IN_FORCE, INACTIVE → ANNULLED), CHECK, default
--   * at-risk / pending lists, Vista general and contract_cartera_rows: IN_FORCE only
--   * list_contract_portfolio: + policy_status_filter and policy_counts (Pólizas filter)

UPDATE public.contract SET status = 'IN_FORCE' WHERE status IS NULL OR status IN ('ACTIVE', 'PENDING');
UPDATE public.contract SET status = 'ANNULLED' WHERE status NOT IN ('IN_FORCE', 'EXTENDED', 'NO_PREMIUMS', 'ANNULLED');

ALTER TABLE public.contract ALTER COLUMN status SET DEFAULT 'IN_FORCE';
ALTER TABLE public.contract ALTER COLUMN status SET NOT NULL;
ALTER TABLE public.contract DROP CONSTRAINT IF EXISTS contract_status_check;
ALTER TABLE public.contract
    ADD CONSTRAINT contract_status_check CHECK (status IN ('IN_FORCE', 'EXTENDED', 'NO_PREMIUMS', 'ANNULLED'));

COMMENT ON COLUMN public.contract.status IS
  'Póliza status from the insurer: IN_FORCE (en vigor), EXTENDED (en vigor prorrogado), NO_PREMIUMS (en vigor sin pago de primas), ANNULLED (anulada). Only IN_FORCE is in cobranza.';

-- Cobranza lists and Vista general: pólizas en vigor only ---------------------------

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
    WHERE c.status = 'IN_FORCE'
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
    WHERE c.status = 'IN_FORCE'
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
            c.collection_day
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
                public.next_collection_due(
                    s.issue_date,
                    GREATEST(lm.paid, ld.paid),
                    s.payment_method,
                    s.collection_day::integer
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

-- Pólizas list: filter and chip counts by póliza status ----------------------------------

DROP FUNCTION IF EXISTS public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer);

CREATE OR REPLACE FUNCTION public.list_contract_portfolio(
    office_id_param uuid DEFAULT NULL,
    consultant_id_param uuid DEFAULT NULL,
    client_id_param uuid DEFAULT NULL,
    search_text text DEFAULT NULL,
    status_filter text DEFAULT NULL,
    sort_column text DEFAULT 'next_due',
    sort_ascending boolean DEFAULT true,
    page_limit integer DEFAULT 25,
    page_offset integer DEFAULT 0,
    risk_days integer DEFAULT 30,
    due_soon_days integer DEFAULT 15,
    policy_status_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_today date := CURRENT_DATE;
    v_search text := NULLIF(lower(btrim(left(search_text, 100))), '');
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
    IF status_filter IS NOT NULL
       AND status_filter NOT IN ('current', 'due_soon', 'overdue', 'at_risk', 'no_payment', 'inactive') THEN
        RAISE EXCEPTION 'Invalid status_filter';
    END IF;
    IF policy_status_filter IS NOT NULL
       AND policy_status_filter NOT IN ('IN_FORCE', 'EXTENDED', 'NO_PREMIUMS', 'ANNULLED') THEN
        RAISE EXCEPTION 'Invalid policy_status_filter';
    END IF;
    IF sort_column IS NULL
       OR sort_column NOT IN ('contract_number', 'client_name', 'consultant_name', 'issue_date', 'next_due', 'payment_method') THEN
        sort_column := 'next_due';
    END IF;
    IF risk_days IS NULL OR risk_days < 1 THEN
        risk_days := 30;
    END IF;
    IF due_soon_days IS NULL OR due_soon_days < 0 THEN
        due_soon_days := 15;
    END IF;
    page_limit := LEAST(GREATEST(COALESCE(page_limit, 25), 1), 100);
    page_offset := GREATEST(COALESCE(page_offset, 0), 0);

    WITH classified AS (
        SELECT k.*
        FROM public.contract_cartera_rows(office_id_param, consultant_id_param, risk_days, due_soon_days) k
        WHERE client_id_param IS NULL OR k.client_id = client_id_param
    ),
    searched AS (
        SELECT k.*
        FROM classified k
        WHERE v_search IS NULL
           OR strpos(lower(COALESCE(k.contract_number, '')), v_search) > 0
           OR strpos(lower(COALESCE(k.client_name, '')), v_search) > 0
           OR strpos(lower(COALESCE(k.consultant_name, '')), v_search) > 0
    ),
    by_policy AS (
        SELECT f.* FROM searched f
        WHERE policy_status_filter IS NULL OR f.status = policy_status_filter
    ),
    filtered AS (
        SELECT f.* FROM by_policy f
        WHERE status_filter IS NULL OR f.cartera_status = status_filter
    ),
    ranked AS (
        SELECT f.*, row_number() OVER (ORDER BY
            CASE WHEN sort_column = 'contract_number' AND sort_ascending THEN f.contract_number END ASC NULLS LAST,
            CASE WHEN sort_column = 'contract_number' AND NOT sort_ascending THEN f.contract_number END DESC NULLS LAST,
            CASE WHEN sort_column = 'client_name' AND sort_ascending THEN f.client_name END ASC NULLS LAST,
            CASE WHEN sort_column = 'client_name' AND NOT sort_ascending THEN f.client_name END DESC NULLS LAST,
            CASE WHEN sort_column = 'consultant_name' AND sort_ascending THEN f.consultant_name END ASC NULLS LAST,
            CASE WHEN sort_column = 'consultant_name' AND NOT sort_ascending THEN f.consultant_name END DESC NULLS LAST,
            CASE WHEN sort_column = 'issue_date' AND sort_ascending THEN f.issue_date END ASC NULLS LAST,
            CASE WHEN sort_column = 'issue_date' AND NOT sort_ascending THEN f.issue_date END DESC NULLS LAST,
            CASE WHEN sort_column = 'payment_method' AND sort_ascending THEN f.payment_method END ASC NULLS LAST,
            CASE WHEN sort_column = 'payment_method' AND NOT sort_ascending THEN f.payment_method END DESC NULLS LAST,
            CASE WHEN sort_column = 'next_due' AND sort_ascending THEN f.next_due END ASC NULLS LAST,
            CASE WHEN sort_column = 'next_due' AND NOT sort_ascending THEN f.next_due END DESC NULLS LAST,
            f.contract_number NULLS LAST,
            f.contract_id
        ) AS ord
        FROM filtered f
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM filtered),
        -- Cartera chips follow the search and the póliza status, not the cartera filter
        'counts', (
            SELECT jsonb_build_object(
                'all', count(*),
                'current', count(*) FILTER (WHERE cartera_status = 'current'),
                'due_soon', count(*) FILTER (WHERE cartera_status = 'due_soon'),
                'overdue', count(*) FILTER (WHERE cartera_status = 'overdue'),
                'at_risk', count(*) FILTER (WHERE cartera_status = 'at_risk'),
                'no_payment', count(*) FILTER (WHERE cartera_status = 'no_payment'),
                'inactive', count(*) FILTER (WHERE cartera_status = 'inactive')
            )
            FROM by_policy
        ),
        -- Póliza status chips follow the search only
        'policy_counts', (
            SELECT jsonb_build_object(
                'all', count(*),
                'IN_FORCE', count(*) FILTER (WHERE status = 'IN_FORCE'),
                'EXTENDED', count(*) FILTER (WHERE status = 'EXTENDED'),
                'NO_PREMIUMS', count(*) FILTER (WHERE status = 'NO_PREMIUMS'),
                'ANNULLED', count(*) FILTER (WHERE status = 'ANNULLED')
            )
            FROM searched
        ),
        -- Counters: whole scope, pólizas en vigor only
        'summary', (
            SELECT jsonb_build_object(
                'active', count(*),
                'clients', count(DISTINCT client_id),
                'consultants', count(DISTINCT consultant_id),
                'current', count(*) FILTER (WHERE cartera_status = 'current'),
                'due_soon', count(*) FILTER (WHERE cartera_status = 'due_soon'),
                'overdue', count(*) FILTER (WHERE cartera_status = 'overdue'),
                'at_risk', count(*) FILTER (WHERE cartera_status = 'at_risk'),
                'no_payment', count(*) FILTER (WHERE cartera_status = 'no_payment'),
                'missing_payment_method', count(*) FILTER (
                    WHERE payment_method IS NULL OR btrim(payment_method) = ''
                ),
                'due_next_30_days', count(*) FILTER (WHERE next_due BETWEEN v_today AND v_today + 29),
                'payments_last_30_days', (
                    SELECT count(*)
                    FROM contract_collection_payment p
                    WHERE p.contract_id IN (SELECT contract_id FROM classified)
                      AND p.paid_at IS NOT NULL
                      AND p.paid_at::date BETWEEN v_today - 29 AND v_today
                )
            )
            FROM classified
            WHERE cartera_status <> 'inactive'
        ),
        'rows', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.contract_id,
                    'contract_number', r.contract_number,
                    'client_id', r.client_id,
                    'client_name', r.client_name,
                    'consultant_id', r.consultant_id,
                    'consultant_name', r.consultant_name,
                    'currency', r.currency,
                    'payment_method', r.payment_method,
                    'issue_date', r.issue_date,
                    'status', r.status,
                    'next_due', r.next_due,
                    'days_past_due', r.days_past_due,
                    'cartera_status', r.cartera_status
                )
                ORDER BY r.ord
            )
            FROM ranked r
            WHERE r.ord > page_offset AND r.ord <= page_offset + page_limit
        ), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer, text) IS
  'Pólizas page with póliza status and cartera status (receipt calendar), chip counts and counters for an office, asesor or cliente.';

REVOKE ALL ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer, text) TO authenticated, service_role;
