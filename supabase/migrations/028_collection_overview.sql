-- Vista general (dashboard) in one round trip. Counts only: amounts are not reliable yet
-- (mixed currencies, optional manual amounts, one mark per month).
-- Status buckets use the same next-due rule as Cobranza and the existing lists:
--   at_risk  : next due more than risk_days ago        (= list_contracts_at_risk)
--   overdue  : next due 1..risk_days days ago          ┐ = list_contracts_pending_payment
--   due_soon : next due today .. today + due_soon_days ┘
--   current  : next due later than that
--   no_payment: no known payment, so no next due can be computed

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
        SELECT c.id, c.consultant_id, c.status, c.payment_method, c.collection_day
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
                -- Same as contract_last_known_payment: latest mark or FECHA PAGO
                public.next_due_from_last_payment(
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

COMMENT ON FUNCTION public.get_collection_overview(uuid, uuid, integer, integer) IS
  'Vista general: cartera status buckets (next-due rule), aging, payments per month (counts), per-asesor breakdown.';

REVOKE ALL ON FUNCTION public.get_collection_overview(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_collection_overview(uuid, uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_collection_overview(uuid, uuid, integer, integer) TO service_role;
