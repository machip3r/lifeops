-- Pólizas list with cartera status: one call returns the page, the per-status counts
-- (chips + counters) and the next due of each póliza from the receipt calendar.
-- Same buckets as get_collection_overview: current, due_soon, overdue, at_risk,
-- no_payment, plus inactive (status INACTIVE, no next due).

CREATE OR REPLACE FUNCTION public.list_contract_portfolio(
    office_id_param uuid DEFAULT NULL,
    consultant_id_param uuid DEFAULT NULL,
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
            END AS next_due
        FROM scoped s
        LEFT JOIN last_mark lm ON lm.contract_id = s.id
        LEFT JOIN last_detail ld ON ld.contract_id = s.id
    ),
    classified AS (
        SELECT
            w.*,
            CASE
                WHEN w.status = 'INACTIVE' THEN 'inactive'
                WHEN w.next_due IS NULL THEN 'no_payment'
                WHEN v_today - w.next_due > risk_days THEN 'at_risk'
                WHEN w.next_due < v_today THEN 'overdue'
                WHEN w.next_due - v_today <= due_soon_days THEN 'due_soon'
                ELSE 'current'
            END AS cartera_status,
            CASE WHEN w.next_due IS NOT NULL THEN (v_today - w.next_due)::integer END AS days_past_due
        FROM with_due w
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
            f.id
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
                'at_risk', count(*) FILTER (WHERE cartera_status = 'at_risk'),
                'no_payment', count(*) FILTER (WHERE cartera_status = 'no_payment'),
                'missing_payment_method', count(*) FILTER (
                    WHERE payment_method IS NULL OR btrim(payment_method) = ''
                ),
                'due_next_30_days', count(*) FILTER (WHERE next_due BETWEEN v_today AND v_today + 29)
            )
            FROM classified
            WHERE cartera_status <> 'inactive'
        ),
        'rows', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', r.id,
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

COMMENT ON FUNCTION public.list_contract_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) IS
  'Pólizas page with cartera status (receipt calendar), chip counts and counters for an office or asesor.';

REVOKE ALL ON FUNCTION public.list_contract_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_contract_portfolio(uuid, uuid, text, text, text, boolean, integer, integer, integer, integer) TO authenticated, service_role;
