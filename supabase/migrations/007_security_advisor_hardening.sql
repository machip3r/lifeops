-- Harden security advisor findings:
-- 1) Fix mutable search_path on handle_updated_at
-- 2) Replace always-true RLS on client / file / token mutations
-- 3) Revoke SECURITY DEFINER EXECUTE from PUBLIC + anon; grant authenticated + service_role
-- 4) Add auth.uid() guards inside privileged RPCs (service_role calls have null uid → allowed)

-- ============================================
-- 1. handle_updated_at search_path
-- ============================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- ============================================
-- 2. client RLS (no USING/WITH CHECK (true))
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert clients" ON client;
DROP POLICY IF EXISTS "Authenticated users can update clients" ON client;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON client;

CREATE POLICY "Authenticated users can insert clients" ON client
FOR INSERT TO authenticated
WITH CHECK (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
    OR office_id IN (SELECT office_id FROM consultant WHERE auth_user_id = (SELECT auth.uid()))
);

CREATE POLICY "Authenticated users can update clients" ON client
FOR UPDATE TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR id IN (
        SELECT client_id FROM contract
        WHERE consultant_id = (SELECT auth.uid()) AND client_id IS NOT NULL
    )
    OR id IN (
        SELECT c.client_id
        FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.auth_user_id = (SELECT auth.uid()) AND c.client_id IS NOT NULL
    )
)
WITH CHECK (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
    OR office_id IN (SELECT office_id FROM consultant WHERE auth_user_id = (SELECT auth.uid()))
);

CREATE POLICY "Authenticated users can delete clients" ON client
FOR DELETE TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR id IN (
        SELECT client_id FROM contract
        WHERE consultant_id = (SELECT auth.uid()) AND client_id IS NOT NULL
    )
);

-- ============================================
-- 3. file RLS — no office_id column; mutations only for promotory accounts
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert files" ON file;
DROP POLICY IF EXISTS "Authenticated users can update files" ON file;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON file;

CREATE POLICY "Authenticated users can insert files" ON file
FOR INSERT TO authenticated
WITH CHECK (
    EXISTS (SELECT 1 FROM office WHERE id = (SELECT auth.uid()))
);

CREATE POLICY "Authenticated users can update files" ON file
FOR UPDATE TO authenticated
USING (
    EXISTS (SELECT 1 FROM office WHERE id = (SELECT auth.uid()))
)
WITH CHECK (
    EXISTS (SELECT 1 FROM office WHERE id = (SELECT auth.uid()))
);

CREATE POLICY "Authenticated users can delete files" ON file
FOR DELETE TO authenticated
USING (
    EXISTS (SELECT 1 FROM office WHERE id = (SELECT auth.uid()))
);

-- ============================================
-- 4. token insert — office-scoped via metadata.office_id
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can insert tokens" ON token;

CREATE POLICY "Authenticated users can insert tokens" ON token
FOR INSERT TO authenticated
WITH CHECK (
    (metadata ? 'office_id')
    AND (metadata->>'office_id')::uuid = (SELECT auth.uid())
);

-- ============================================
-- 5. Auth helpers for RPCs
-- ============================================
CREATE OR REPLACE FUNCTION public.caller_can_access_office(office_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT auth.uid()) IS NULL -- service_role / definer paths without JWT
    OR (SELECT auth.uid()) = office_id_param
    OR EXISTS (
      SELECT 1 FROM consultant c
      WHERE c.office_id = office_id_param
        AND (c.id = (SELECT auth.uid()) OR c.auth_user_id = (SELECT auth.uid()))
    );
$$;

CREATE OR REPLACE FUNCTION public.caller_can_access_consultant(consultant_id_param uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    (SELECT auth.uid()) IS NULL
    OR EXISTS (
      SELECT 1 FROM consultant c
      WHERE c.id = consultant_id_param
        AND (
          c.id = (SELECT auth.uid())
          OR c.auth_user_id = (SELECT auth.uid())
          OR c.office_id = (SELECT auth.uid())
        )
    );
$$;

-- ============================================
-- 6. Privileged RPCs with auth guards (bodies match schema.sql filters)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_office(
    user_id UUID,
    user_email TEXT,
    office_name TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) IS DISTINCT FROM user_id THEN
        RAISE EXCEPTION 'Not authorized to create office for another user';
    END IF;

    INSERT INTO office (id, email, name)
    VALUES (user_id, user_email, office_name)
    ON CONFLICT (id) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_consultant(
    user_id UUID,
    user_email TEXT,
    consultant_name TEXT,
    consultant_code TEXT,
    office_id_param UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) IS DISTINCT FROM user_id THEN
        RAISE EXCEPTION 'Not authorized to create consultant for another user';
    END IF;

    UPDATE consultant
    SET
        auth_user_id = user_id,
        email = COALESCE(consultant.email, user_email),
        consultant_code = COALESCE(consultant.consultant_code, consultant_code)
    WHERE (email = user_email OR name = consultant_name)
      AND office_id = office_id_param
      AND auth_user_id IS NULL;

    IF NOT FOUND THEN
        INSERT INTO consultant (auth_user_id, email, name, consultant_code, office_id)
        VALUES (user_id, user_email, consultant_name, consultant_code, office_id_param)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invitation_token(
    type TEXT,
    office_id UUID,
    consultant_email TEXT,
    consultant_name TEXT,
    consultant_code TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_token TEXT;
    uuid1 TEXT;
    uuid2 TEXT;
BEGIN
    -- Client callers must be the office; service_role (null uid) is allowed after app-layer checks.
    IF (SELECT auth.uid()) IS NOT NULL AND (SELECT auth.uid()) IS DISTINCT FROM office_id THEN
        RAISE EXCEPTION 'Not authorized to create invitation for another office';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM office WHERE id = office_id) THEN
        RAISE EXCEPTION 'Office not found';
    END IF;

    uuid1 := replace(gen_random_uuid()::TEXT, '-', '');
    uuid2 := replace(gen_random_uuid()::TEXT, '-', '');
    new_token := uuid1 || uuid2;
    new_token := replace(replace(replace(new_token, '+', '-'), '/', '_'), '=', '');

    INSERT INTO token (
        token,
        type,
        status,
        expires_at,
        metadata
    )
    VALUES (
        new_token,
        type,
        'ACTIVE',
        NOW() + ('7 days'::INTERVAL),
        jsonb_build_object(
            'office_id', office_id,
            'consultant_email', consultant_email,
            'consultant_name', consultant_name,
            'consultant_code', consultant_code
        )
    );

    RETURN new_token;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_token_as_used(
    token_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (SELECT auth.uid()) IS NULL THEN
        -- Allow service_role; block true anonymous PostgREST (anon EXECUTE revoked below)
        NULL;
    END IF;

    UPDATE token
    SET
        used_at = NOW(),
        status = 'USED'
    WHERE id = token_id
      AND used_at IS NULL
      AND expires_at > NOW()
      AND status = 'ACTIVE';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_office_totals(
    office_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    date_basis text DEFAULT 'payment',
    seniority_min numeric DEFAULT NULL,
    seniority_max numeric DEFAULT NULL,
    consultant_ids uuid[] DEFAULT NULL,
    contract_type_filter text DEFAULT NULL,
    payment_method_filter text DEFAULT NULL
)
RETURNS TABLE(total_prima_pago numeric, total_prima_meta numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this office';
  END IF;

  RETURN QUERY
  SELECT COALESCE(SUM(cd.premium_payment), 0)::numeric, COALESCE(SUM(cd.target_premium), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  JOIN consultant cons ON cons.id = c.consultant_id
  WHERE cons.office_id = office_id_param
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        (start_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) >= start_date)
        AND (end_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) <= end_date)
      )
    )
    AND (
      (seniority_min IS NULL AND seniority_max IS NULL)
      OR (
        (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) IS NOT NULL
        AND (seniority_min IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) >= seniority_min)
        AND (seniority_max IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) <= seniority_max)
      )
    )
    AND (consultant_ids IS NULL OR cons.id = ANY(consultant_ids))
    AND (contract_type_filter IS NULL OR (contract_type_filter = 'VI' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%') OR (contract_type_filter = 'GM' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'))
    AND (payment_method_filter IS NULL OR cd.payment_method = payment_method_filter);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_top_consultants_by_sales(
    office_id_param uuid,
    limit_count int DEFAULT 3,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    date_basis text DEFAULT 'payment',
    seniority_min numeric DEFAULT NULL,
    seniority_max numeric DEFAULT NULL,
    consultant_ids uuid[] DEFAULT NULL,
    contract_type_filter text DEFAULT NULL,
    payment_method_filter text DEFAULT NULL
)
RETURNS TABLE(consultant_id uuid, consultant_name text, consultant_code text, consultant_email text, total_sales numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this office';
  END IF;

  RETURN QUERY
  SELECT cons.id, cons.name, cons.consultant_code, cons.email, COALESCE(SUM(cd.premium_payment), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  JOIN consultant cons ON cons.id = c.consultant_id
  WHERE cons.office_id = office_id_param
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        (start_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) >= start_date)
        AND (end_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) <= end_date)
      )
    )
    AND (
      (seniority_min IS NULL AND seniority_max IS NULL)
      OR (
        (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) IS NOT NULL
        AND (seniority_min IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) >= seniority_min)
        AND (seniority_max IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) <= seniority_max)
      )
    )
    AND (consultant_ids IS NULL OR cons.id = ANY(consultant_ids))
    AND (contract_type_filter IS NULL OR (contract_type_filter = 'VI' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%') OR (contract_type_filter = 'GM' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'))
    AND (payment_method_filter IS NULL OR cd.payment_method = payment_method_filter)
  GROUP BY cons.id, cons.name, cons.consultant_code, cons.email
  ORDER BY 5 DESC
  LIMIT limit_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_office_totals_by_type(
    office_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    date_basis text DEFAULT 'payment',
    seniority_min numeric DEFAULT NULL,
    seniority_max numeric DEFAULT NULL,
    consultant_ids uuid[] DEFAULT NULL,
    contract_type_filter text DEFAULT NULL,
    payment_method_filter text DEFAULT NULL
)
RETURNS TABLE(prima_meta_vi numeric, prima_meta_gm numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this office';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(cd.target_premium) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%'), 0)::numeric,
    COALESCE(SUM(cd.target_premium) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  JOIN consultant cons ON cons.id = c.consultant_id
  WHERE cons.office_id = office_id_param
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        (start_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) >= start_date)
        AND (end_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) <= end_date)
      )
    )
    AND (
      (seniority_min IS NULL AND seniority_max IS NULL)
      OR (
        (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) IS NOT NULL
        AND (seniority_min IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) >= seniority_min)
        AND (seniority_max IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) <= seniority_max)
      )
    )
    AND (consultant_ids IS NULL OR cons.id = ANY(consultant_ids))
    AND (contract_type_filter IS NULL OR (contract_type_filter = 'VI' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%') OR (contract_type_filter = 'GM' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'))
    AND (payment_method_filter IS NULL OR cd.payment_method = payment_method_filter);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_office_consultants_sales(
    office_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    date_basis text DEFAULT 'payment',
    seniority_min numeric DEFAULT NULL,
    seniority_max numeric DEFAULT NULL,
    consultant_ids uuid[] DEFAULT NULL,
    contract_type_filter text DEFAULT NULL,
    payment_method_filter text DEFAULT NULL
)
RETURNS TABLE(consultant_id uuid, total_sales numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_office(office_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this office';
  END IF;

  RETURN QUERY
  SELECT cons.id, COALESCE(SUM(cd.premium_payment), 0)::numeric
  FROM consultant cons
  LEFT JOIN contract c ON c.consultant_id = cons.id
  LEFT JOIN contract_detail cd ON cd.contract_id = c.id
    AND (
      (start_date IS NULL AND end_date IS NULL)
      OR (
        (start_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) >= start_date)
        AND (end_date IS NULL OR (CASE WHEN date_basis = 'issue' THEN cd.issue_date ELSE cd.payment_date END) <= end_date)
      )
    )
    AND (
      (seniority_min IS NULL AND seniority_max IS NULL)
      OR (
        (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) IS NOT NULL
        AND (seniority_min IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) >= seniority_min)
        AND (seniority_max IS NULL OR (NULLIF(regexp_replace(trim(COALESCE(cd.seniority, '')), '[^0-9.]', '', 'g'), '')::numeric) <= seniority_max)
      )
    )
    AND (contract_type_filter IS NULL OR (contract_type_filter = 'VI' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%') OR (contract_type_filter = 'GM' AND c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'))
    AND (payment_method_filter IS NULL OR cd.payment_method = payment_method_filter)
  WHERE cons.office_id = office_id_param
    AND (consultant_ids IS NULL OR cons.id = ANY(consultant_ids))
  GROUP BY cons.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consultant_totals(
    consultant_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    seniority_param text DEFAULT NULL
)
RETURNS TABLE(total_prima_pago numeric, total_prima_meta numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_consultant(consultant_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this consultant';
  END IF;

  RETURN QUERY
  SELECT COALESCE(SUM(cd.premium_payment), 0)::numeric, COALESCE(SUM(cd.target_premium), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  WHERE c.consultant_id = consultant_id_param
    AND ((start_date IS NULL AND end_date IS NULL) OR ((start_date IS NULL OR cd.payment_date >= start_date) AND (end_date IS NULL OR cd.payment_date <= end_date)))
    AND (seniority_param IS NULL OR cd.seniority = seniority_param);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_consultant_totals_by_type(
    consultant_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    seniority_param text DEFAULT NULL
)
RETURNS TABLE(prima_pago_vi numeric, prima_pago_gm numeric, prima_meta_vi numeric, prima_meta_gm numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.caller_can_access_consultant(consultant_id_param) THEN
    RAISE EXCEPTION 'Not authorized for this consultant';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(cd.premium_payment) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%'), 0)::numeric,
    COALESCE(SUM(cd.premium_payment) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'), 0)::numeric,
    COALESCE(SUM(cd.target_premium) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'VI%'), 0)::numeric,
    COALESCE(SUM(cd.target_premium) FILTER (WHERE c.contract_number IS NOT NULL AND c.contract_number ILIKE 'GM%'), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  WHERE c.consultant_id = consultant_id_param
    AND ((start_date IS NULL AND end_date IS NULL) OR ((start_date IS NULL OR cd.payment_date >= start_date) AND (end_date IS NULL OR cd.payment_date <= end_date)))
    AND (seniority_param IS NULL OR cd.seniority = seniority_param);
END;
$$;

-- Revoke PUBLIC/anon on all overloads; grant authenticated + service_role
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'create_office',
        'create_consultant',
        'create_invitation_token',
        'mark_token_as_used',
        'get_office_totals',
        'get_office_totals_by_type',
        'get_top_consultants_by_sales',
        'get_office_consultants_sales',
        'get_consultant_totals',
        'get_consultant_totals_by_type',
        'caller_can_access_office',
        'caller_can_access_consultant',
        'seed_collection_payments_from_details'
      ])
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
