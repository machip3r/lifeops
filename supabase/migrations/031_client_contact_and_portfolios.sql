-- Clientes / Asesores with cartera status (same buckets as Vista general and Pólizas):
--   * client contact data (phone, email) owned by the promotoría
--   * contract_cartera_rows: one classified row per póliza (internal helper)
--   * list_contract_portfolio: + client filter, fuller summary (replaces the 030 version)
--   * list_client_portfolio / list_consultant_portfolio: list pages with counts and counters

-- Client contact ------------------------------------------------------------

ALTER TABLE public.client
    ADD COLUMN IF NOT EXISTS phone text,
    ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.client DROP CONSTRAINT IF EXISTS client_phone_check;
ALTER TABLE public.client
    ADD CONSTRAINT client_phone_check CHECK (phone IS NULL OR phone ~ '^[0-9]{10}$');

ALTER TABLE public.client DROP CONSTRAINT IF EXISTS client_email_check;
ALTER TABLE public.client
    ADD CONSTRAINT client_email_check CHECK (
        email IS NULL
        OR (char_length(email) <= 254 AND email = lower(email) AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
    );

COMMENT ON COLUMN public.client.phone IS 'Contact phone / WhatsApp, 10 digits (MX). Owned by the promotoría.';
COMMENT ON COLUMN public.client.email IS 'Contact email, lowercase. Owned by the promotoría.';

-- Classified pólizas (internal) ----------------------------------------------

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
            CASE WHEN s.status IS DISTINCT FROM 'INACTIVE' THEN
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
            WHEN w.status = 'INACTIVE' THEN 'inactive'
            WHEN w.due IS NULL THEN 'no_payment'
            WHEN CURRENT_DATE - w.due > risk_days THEN 'at_risk'
            WHEN w.due < CURRENT_DATE THEN 'overdue'
            WHEN w.due - CURRENT_DATE <= due_soon_days THEN 'due_soon'
            ELSE 'current'
        END
    FROM with_due w;
$$;

COMMENT ON FUNCTION public.contract_cartera_rows(uuid, uuid, integer, integer) IS
  'Internal: every póliza in scope with next due (receipt calendar) and cartera bucket. Callers authorize.';

-- Internal only: the list RPCs (SECURITY DEFINER) authorize and call it
REVOKE ALL ON FUNCTION public.contract_cartera_rows(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contract_cartera_rows(uuid, uuid, integer, integer) TO service_role;

-- Pólizas list (adds client filter) ----------------------------------------------

DROP FUNCTION IF EXISTS public.list_contract_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer);

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
    filtered AS (
        SELECT f.* FROM searched f
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
        -- Chip counts follow the search, not the status filter
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
            FROM searched
        ),
        -- Counters: whole scope, active pólizas only
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

COMMENT ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) IS
  'Pólizas page with cartera status (receipt calendar), chip counts and counters for an office, asesor or cliente.';

REVOKE ALL ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_contract_portfolio(uuid, uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) TO authenticated, service_role;

-- Clientes list -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_client_portfolio(
    office_id_param uuid DEFAULT NULL,
    consultant_id_param uuid DEFAULT NULL,
    search_text text DEFAULT NULL,
    status_filter text DEFAULT NULL,
    sort_column text DEFAULT 'name',
    sort_ascending boolean DEFAULT true,
    page_limit integer DEFAULT 25,
    page_offset integer DEFAULT 0,
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
    IF status_filter IS NOT NULL AND status_filter NOT IN ('with_active', 'late', 'at_risk', 'no_active') THEN
        RAISE EXCEPTION 'Invalid status_filter';
    END IF;
    IF sort_column IS NULL
       OR sort_column NOT IN ('name', 'next_due', 'active_contracts', 'birth_date', 'created_at', 'status') THEN
        sort_column := 'name';
    END IF;
    IF risk_days IS NULL OR risk_days < 1 THEN
        risk_days := 30;
    END IF;
    IF due_soon_days IS NULL OR due_soon_days < 0 THEN
        due_soon_days := 15;
    END IF;
    page_limit := LEAST(GREATEST(COALESCE(page_limit, 25), 1), 100);
    page_offset := GREATEST(COALESCE(page_offset, 0), 0);

    WITH k AS (
        SELECT * FROM public.contract_cartera_rows(office_id_param, consultant_id_param, risk_days, due_soon_days)
    ),
    scoped_clients AS (
        -- Asesor: clients of its pólizas. Promotoría: its clients plus any client with a póliza in the office.
        SELECT cl.*
        FROM client cl
        WHERE cl.id IN (SELECT k.client_id FROM k WHERE k.client_id IS NOT NULL)
           OR (consultant_id_param IS NULL AND cl.office_id = office_id_param)
    ),
    agg AS (
        SELECT
            k.client_id,
            count(*) FILTER (WHERE k.cartera_status <> 'inactive') AS active_contracts,
            count(*) AS total_contracts,
            min(k.next_due) AS next_due,
            max(CASE k.cartera_status
                WHEN 'at_risk' THEN 5 WHEN 'overdue' THEN 4 WHEN 'due_soon' THEN 3
                WHEN 'current' THEN 2 WHEN 'no_payment' THEN 1 ELSE 0 END) AS worst_rank,
            max(k.days_past_due) AS max_days_past_due,
            string_agg(DISTINCT k.consultant_name, ', ') AS consultant_names
        FROM k
        WHERE k.client_id IS NOT NULL
        GROUP BY k.client_id
    ),
    base AS (
        SELECT
            sc.id,
            sc.name,
            sc.curp,
            sc.rfc,
            sc.phone,
            sc.email,
            sc.birth_date,
            sc.created_at,
            COALESCE(a.active_contracts, 0)::integer AS active_contracts,
            COALESCE(a.total_contracts, 0)::integer AS total_contracts,
            a.next_due,
            a.consultant_names,
            COALESCE(a.worst_rank, 0) AS worst_rank,
            CASE COALESCE(a.worst_rank, 0)
                WHEN 5 THEN 'at_risk' WHEN 4 THEN 'overdue' WHEN 3 THEN 'due_soon'
                WHEN 2 THEN 'current' WHEN 1 THEN 'no_payment' ELSE 'none' END AS cartera_status,
            CASE WHEN a.worst_rank IN (4, 5) THEN a.max_days_past_due END AS days_past_due
        FROM scoped_clients sc
        LEFT JOIN agg a ON a.client_id = sc.id
    ),
    searched AS (
        SELECT b.*
        FROM base b
        WHERE v_search IS NULL
           OR strpos(lower(b.name), v_search) > 0
           OR strpos(lower(COALESCE(b.curp, '')), v_search) > 0
           OR strpos(lower(COALESCE(b.rfc, '')), v_search) > 0
           OR strpos(COALESCE(b.email, ''), v_search) > 0
           OR strpos(COALESCE(b.phone, ''), v_search) > 0
           OR strpos(lower(COALESCE(b.consultant_names, '')), v_search) > 0
    ),
    filtered AS (
        SELECT s.*
        FROM searched s
        WHERE status_filter IS NULL
           OR (status_filter = 'with_active' AND s.active_contracts > 0)
           OR (status_filter = 'late' AND s.cartera_status IN ('overdue', 'at_risk'))
           OR (status_filter = 'at_risk' AND s.cartera_status = 'at_risk')
           OR (status_filter = 'no_active' AND s.active_contracts = 0)
    ),
    ranked AS (
        SELECT f.*, row_number() OVER (ORDER BY
            CASE WHEN sort_column = 'name' AND sort_ascending THEN lower(f.name) END ASC NULLS LAST,
            CASE WHEN sort_column = 'name' AND NOT sort_ascending THEN lower(f.name) END DESC NULLS LAST,
            CASE WHEN sort_column = 'next_due' AND sort_ascending THEN f.next_due END ASC NULLS LAST,
            CASE WHEN sort_column = 'next_due' AND NOT sort_ascending THEN f.next_due END DESC NULLS LAST,
            CASE WHEN sort_column = 'active_contracts' AND sort_ascending THEN f.active_contracts END ASC NULLS LAST,
            CASE WHEN sort_column = 'active_contracts' AND NOT sort_ascending THEN f.active_contracts END DESC NULLS LAST,
            CASE WHEN sort_column = 'birth_date' AND sort_ascending THEN f.birth_date END ASC NULLS LAST,
            CASE WHEN sort_column = 'birth_date' AND NOT sort_ascending THEN f.birth_date END DESC NULLS LAST,
            CASE WHEN sort_column = 'created_at' AND sort_ascending THEN f.created_at END ASC NULLS LAST,
            CASE WHEN sort_column = 'created_at' AND NOT sort_ascending THEN f.created_at END DESC NULLS LAST,
            -- status: most critical first when descending
            CASE WHEN sort_column = 'status' AND sort_ascending THEN f.worst_rank END ASC NULLS LAST,
            CASE WHEN sort_column = 'status' AND NOT sort_ascending THEN f.worst_rank END DESC NULLS LAST,
            lower(f.name),
            f.id
        ) AS ord
        FROM filtered f
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM filtered),
        'counts', (
            SELECT jsonb_build_object(
                'all', count(*),
                'with_active', count(*) FILTER (WHERE active_contracts > 0),
                'late', count(*) FILTER (WHERE cartera_status IN ('overdue', 'at_risk')),
                'at_risk', count(*) FILTER (WHERE cartera_status = 'at_risk'),
                'no_active', count(*) FILTER (WHERE active_contracts = 0)
            )
            FROM searched
        ),
        'summary', (
            SELECT jsonb_build_object(
                'clients', count(*),
                'with_active', count(*) FILTER (WHERE active_contracts > 0),
                'late', count(*) FILTER (WHERE cartera_status IN ('overdue', 'at_risk')),
                'at_risk', count(*) FILTER (WHERE cartera_status = 'at_risk'),
                'birthdays_this_month', count(*) FILTER (
                    WHERE EXTRACT(MONTH FROM birth_date) = EXTRACT(MONTH FROM CURRENT_DATE)
                ),
                'missing_contact', count(*) FILTER (WHERE phone IS NULL AND email IS NULL)
            )
            FROM base
        ),
        'rows', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'name', r.name,
                    'curp', r.curp,
                    'rfc', r.rfc,
                    'phone', r.phone,
                    'email', r.email,
                    'birth_date', r.birth_date,
                    'created_at', r.created_at,
                    'active_contracts', r.active_contracts,
                    'total_contracts', r.total_contracts,
                    'next_due', r.next_due,
                    'consultant_names', r.consultant_names,
                    'cartera_status', r.cartera_status,
                    'days_past_due', r.days_past_due
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

COMMENT ON FUNCTION public.list_client_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) IS
  'Clientes page: contact, pólizas activas, most critical cartera status and next due per client, chip counts and counters.';

REVOKE ALL ON FUNCTION public.list_client_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_client_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) TO authenticated, service_role;

-- Asesores list (promotoría only) ------------------------------------------------

CREATE OR REPLACE FUNCTION public.list_consultant_portfolio(
    office_id_param uuid,
    search_text text DEFAULT NULL,
    status_filter text DEFAULT NULL,
    sort_column text DEFAULT 'name',
    sort_ascending boolean DEFAULT true,
    page_limit integer DEFAULT 25,
    page_offset integer DEFAULT 0,
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
    v_search text := NULLIF(lower(btrim(left(search_text, 100))), '');
    v_result jsonb;
BEGIN
    IF office_id_param IS NULL OR NOT public.caller_can_access_office(office_id_param) THEN
        RAISE EXCEPTION 'Not authorized for office';
    END IF;
    -- Asesores of an office are the promotoría's view only
    IF auth.uid() IS DISTINCT FROM office_id_param THEN
        RAISE EXCEPTION 'Not authorized for office';
    END IF;
    IF status_filter IS NOT NULL AND status_filter NOT IN ('ACTIVE', 'PENDING', 'NOT_INVITED', 'INACTIVE') THEN
        RAISE EXCEPTION 'Invalid status_filter';
    END IF;
    IF sort_column IS NULL
       OR sort_column NOT IN ('name', 'consultant_code', 'created_at', 'active_contracts', 'healthy_share', 'late') THEN
        sort_column := 'name';
    END IF;
    IF risk_days IS NULL OR risk_days < 1 THEN
        risk_days := 30;
    END IF;
    IF due_soon_days IS NULL OR due_soon_days < 0 THEN
        due_soon_days := 15;
    END IF;
    page_limit := LEAST(GREATEST(COALESCE(page_limit, 25), 1), 100);
    page_offset := GREATEST(COALESCE(page_offset, 0), 0);

    WITH k AS (
        SELECT * FROM public.contract_cartera_rows(office_id_param, NULL, risk_days, due_soon_days)
    ),
    agg AS (
        SELECT
            k.consultant_id,
            count(*) FILTER (WHERE k.cartera_status <> 'inactive') AS active_contracts,
            count(DISTINCT k.client_id) FILTER (WHERE k.cartera_status <> 'inactive') AS clients,
            count(*) FILTER (WHERE k.cartera_status = 'current') AS current,
            count(*) FILTER (WHERE k.cartera_status = 'due_soon') AS due_soon,
            count(*) FILTER (WHERE k.cartera_status = 'overdue') AS overdue,
            count(*) FILTER (WHERE k.cartera_status = 'at_risk') AS at_risk,
            count(*) FILTER (WHERE k.cartera_status = 'no_payment') AS no_payment
        FROM k
        GROUP BY k.consultant_id
    ),
    pay AS (
        SELECT c.consultant_id, count(*) AS n
        FROM contract_collection_payment p
        JOIN contract c ON c.id = p.contract_id
        WHERE c.office_id = office_id_param
          AND p.paid_at IS NOT NULL
          AND p.paid_at::date BETWEEN v_today - 29 AND v_today
        GROUP BY c.consultant_id
    ),
    base AS (
        SELECT
            cons.id,
            cons.name,
            cons.email,
            cons.consultant_code,
            cons.status,
            cons.created_at,
            COALESCE(a.active_contracts, 0)::integer AS active_contracts,
            COALESCE(a.clients, 0)::integer AS clients,
            COALESCE(a.current, 0)::integer AS current,
            COALESCE(a.due_soon, 0)::integer AS due_soon,
            COALESCE(a.overdue, 0)::integer AS overdue,
            COALESCE(a.at_risk, 0)::integer AS at_risk,
            COALESCE(a.no_payment, 0)::integer AS no_payment,
            COALESCE(pay.n, 0)::integer AS payments_last_30_days,
            CASE WHEN COALESCE(a.current + a.due_soon + a.overdue + a.at_risk, 0) > 0
                THEN round((a.current + a.due_soon)::numeric / (a.current + a.due_soon + a.overdue + a.at_risk), 4)
            END AS healthy_share
        FROM consultant cons
        LEFT JOIN agg a ON a.consultant_id = cons.id
        LEFT JOIN pay ON pay.consultant_id = cons.id
        WHERE cons.office_id = office_id_param
    ),
    searched AS (
        SELECT b.*
        FROM base b
        WHERE v_search IS NULL
           OR strpos(lower(b.name), v_search) > 0
           OR strpos(lower(COALESCE(b.consultant_code, '')), v_search) > 0
           OR strpos(lower(COALESCE(b.email, '')), v_search) > 0
    ),
    filtered AS (
        SELECT s.* FROM searched s
        WHERE status_filter IS NULL OR s.status = status_filter
    ),
    ranked AS (
        SELECT f.*, row_number() OVER (ORDER BY
            CASE WHEN sort_column = 'name' AND sort_ascending THEN lower(f.name) END ASC NULLS LAST,
            CASE WHEN sort_column = 'name' AND NOT sort_ascending THEN lower(f.name) END DESC NULLS LAST,
            CASE WHEN sort_column = 'consultant_code' AND sort_ascending THEN f.consultant_code END ASC NULLS LAST,
            CASE WHEN sort_column = 'consultant_code' AND NOT sort_ascending THEN f.consultant_code END DESC NULLS LAST,
            CASE WHEN sort_column = 'created_at' AND sort_ascending THEN f.created_at END ASC NULLS LAST,
            CASE WHEN sort_column = 'created_at' AND NOT sort_ascending THEN f.created_at END DESC NULLS LAST,
            CASE WHEN sort_column = 'active_contracts' AND sort_ascending THEN f.active_contracts END ASC NULLS LAST,
            CASE WHEN sort_column = 'active_contracts' AND NOT sort_ascending THEN f.active_contracts END DESC NULLS LAST,
            CASE WHEN sort_column = 'healthy_share' AND sort_ascending THEN f.healthy_share END ASC NULLS LAST,
            CASE WHEN sort_column = 'healthy_share' AND NOT sort_ascending THEN f.healthy_share END DESC NULLS LAST,
            CASE WHEN sort_column = 'late' AND sort_ascending THEN f.overdue + f.at_risk END ASC NULLS LAST,
            CASE WHEN sort_column = 'late' AND NOT sort_ascending THEN f.overdue + f.at_risk END DESC NULLS LAST,
            lower(f.name),
            f.id
        ) AS ord
        FROM filtered f
    )
    SELECT jsonb_build_object(
        'total', (SELECT count(*) FROM filtered),
        'counts', (
            SELECT jsonb_build_object(
                'all', count(*),
                'ACTIVE', count(*) FILTER (WHERE status = 'ACTIVE'),
                'PENDING', count(*) FILTER (WHERE status = 'PENDING'),
                'NOT_INVITED', count(*) FILTER (WHERE status = 'NOT_INVITED'),
                'INACTIVE', count(*) FILTER (WHERE status = 'INACTIVE')
            )
            FROM searched
        ),
        'summary', (
            SELECT jsonb_build_object(
                'consultants', count(*) FILTER (WHERE status <> 'INACTIVE'),
                'active', count(*) FILTER (WHERE status = 'ACTIVE'),
                'pending_invites', count(*) FILTER (WHERE status IN ('PENDING', 'NOT_INVITED')),
                'active_contracts', COALESCE(sum(active_contracts), 0),
                'healthy_share', CASE WHEN sum(current + due_soon + overdue + at_risk) > 0
                    THEN round(sum(current + due_soon)::numeric / sum(current + due_soon + overdue + at_risk), 4)
                END,
                'with_at_risk', count(*) FILTER (WHERE at_risk > 0),
                'at_risk_names', COALESCE(
                    (SELECT jsonb_agg(x.name ORDER BY x.at_risk DESC, x.name)
                     FROM (SELECT b2.name, b2.at_risk FROM base b2 WHERE b2.at_risk > 0 ORDER BY b2.at_risk DESC, b2.name LIMIT 4) x),
                    '[]'::jsonb
                )
            )
            FROM base
        ),
        'rows', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
                    'name', r.name,
                    'email', r.email,
                    'consultant_code', r.consultant_code,
                    'status', r.status,
                    'created_at', r.created_at,
                    'active_contracts', r.active_contracts,
                    'clients', r.clients,
                    'current', r.current,
                    'due_soon', r.due_soon,
                    'overdue', r.overdue,
                    'at_risk', r.at_risk,
                    'no_payment', r.no_payment,
                    'payments_last_30_days', r.payments_last_30_days,
                    'healthy_share', r.healthy_share
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

COMMENT ON FUNCTION public.list_consultant_portfolio(uuid, text, text, text, boolean, integer, integer, integer, integer) IS
  'Asesores page (promotoría): cartera per asesor (buckets, % al día, pagos 30 días), status chip counts and counters.';

REVOKE ALL ON FUNCTION public.list_consultant_portfolio(uuid, text, text, text, boolean, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_consultant_portfolio(uuid, text, text, text, boolean, integer, integer, integer, integer) TO authenticated, service_role;
