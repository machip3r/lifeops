-- Cobranza board in one call: every active póliza with its next receipt, cartera status,
-- client contact and asesor (the page filters by period / asesor in the browser), plus
-- payments registered this month. Replaces the chunked table reads of the old schedule list.

CREATE OR REPLACE FUNCTION public.list_collection_board(
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

    WITH k AS (
        SELECT *
        FROM public.contract_cartera_rows(office_id_param, consultant_id_param, risk_days, due_soon_days)
        WHERE cartera_status <> 'inactive'
    ),
    last_mark AS (
        SELECT p.contract_id, MAX(p.paid_at::date) AS paid
        FROM contract_collection_payment p
        JOIN k ON k.contract_id = p.contract_id
        WHERE p.paid_at IS NOT NULL
        GROUP BY p.contract_id
    ),
    last_detail AS (
        SELECT d.contract_id, MAX(d.payment_date) AS paid
        FROM contract_detail d
        JOIN k ON k.contract_id = d.contract_id
        WHERE d.payment_date IS NOT NULL
        GROUP BY d.contract_id
    ),
    -- Amount hint: primas of the latest FECHA PAGO in the commission files
    last_amount AS (
        SELECT d.contract_id, SUM(d.premium_payment) AS amount
        FROM contract_detail d
        JOIN last_detail ld ON ld.contract_id = d.contract_id AND d.payment_date = ld.paid
        GROUP BY d.contract_id
    )
    SELECT jsonb_build_object(
        'today', v_today,
        -- Same count as get_collection_overview (inactive pólizas keep their payments)
        'payments_month_to_date', (
            SELECT count(*)
            FROM contract_collection_payment p
            JOIN contract c ON c.id = p.contract_id
            WHERE (office_id_param IS NULL OR c.office_id = office_id_param)
              AND (consultant_id_param IS NULL OR c.consultant_id = consultant_id_param)
              AND p.paid_at IS NOT NULL
              AND p.paid_at::date BETWEEN date_trunc('month', v_today)::date AND v_today
        ),
        'rows', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'contract_id', k.contract_id,
                    'contract_number', k.contract_number,
                    'client_id', k.client_id,
                    'client_name', k.client_name,
                    'client_phone', cl.phone,
                    'consultant_id', k.consultant_id,
                    'consultant_name', k.consultant_name,
                    'consultant_code', cons.consultant_code,
                    'payment_method', k.payment_method,
                    'currency', k.currency,
                    'issue_date', k.issue_date,
                    'collection_day', c.collection_day,
                    'next_due', k.next_due,
                    'days_past_due', k.days_past_due,
                    'cartera_status', k.cartera_status,
                    'last_paid_at', GREATEST(lm.paid, ld.paid),
                    'amount', la.amount
                )
                ORDER BY k.next_due NULLS LAST, k.contract_number
            )
            FROM k
            JOIN contract c ON c.id = k.contract_id
            JOIN consultant cons ON cons.id = k.consultant_id
            LEFT JOIN client cl ON cl.id = k.client_id
            LEFT JOIN last_mark lm ON lm.contract_id = k.contract_id
            LEFT JOIN last_detail ld ON ld.contract_id = k.contract_id
            LEFT JOIN last_amount la ON la.contract_id = k.contract_id
        ), '[]'::jsonb)
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.list_collection_board(uuid, uuid, integer, integer) IS
  'Cobranza: active pólizas with next receipt, cartera status, client phone and asesor; payments this month.';

REVOKE ALL ON FUNCTION public.list_collection_board(uuid, uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_collection_board(uuid, uuid, integer, integer) TO authenticated, service_role;
