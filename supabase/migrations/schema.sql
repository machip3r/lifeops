-- ============================================
-- LifeOps Complete Database Schema
-- Execute this file in Supabase SQL Editor to set up the entire database
-- ============================================

-- ============================================
-- 0. EXTENSIONS
-- ============================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================
-- 1. OFFICE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS office (
    id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Indexes for office
CREATE INDEX IF NOT EXISTS idx_office_email ON office (email);

-- ============================================
-- 2. CONSULTANT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS consultant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid (), -- Can be temporary UUID or auth user ID
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    email TEXT, -- Can be null initially
    consultant_code TEXT, -- Can be null initially
    auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL, -- Links to auth user when created
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (
        status IN (
            'ACTIVE',
            'INACTIVE',
            'PENDING'
        )
    ),
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Indexes for consultant
CREATE UNIQUE INDEX IF NOT EXISTS consultant_email_unique ON consultant (email)
WHERE
    email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS consultant_code_per_office_unique ON consultant (office_id, consultant_code)
WHERE
    consultant_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consultant_office_id ON consultant (office_id);

CREATE INDEX IF NOT EXISTS idx_consultant_status ON consultant (status);

CREATE INDEX IF NOT EXISTS idx_consultant_auth_user_id ON consultant (auth_user_id);

-- ============================================
-- 3. CLIENT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS client (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    office_id UUID REFERENCES office(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    birth_date DATE,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Indexes for client
CREATE INDEX IF NOT EXISTS idx_client_name ON client (name);
CREATE INDEX IF NOT EXISTS idx_client_office_id ON client (office_id);

-- ============================================
-- 4. TOKEN TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS token (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'CONSULTANT_INVITATION',
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'USED', 'EXPIRED')),
    metadata JSONB DEFAULT '{}'::jsonb,
    used_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for token
CREATE INDEX IF NOT EXISTS idx_token_token ON token (token);

CREATE INDEX IF NOT EXISTS idx_token_type ON token (type);

CREATE INDEX IF NOT EXISTS idx_token_status ON token (status);

CREATE INDEX IF NOT EXISTS idx_token_expires_at ON token (expires_at);

CREATE INDEX IF NOT EXISTS idx_token_used_at ON token (used_at);

-- ============================================
-- 4. CONTRACT TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS contract (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    consultant_id UUID NOT NULL REFERENCES consultant (id) ON DELETE CASCADE,
    client_id UUID REFERENCES client (id) ON DELETE CASCADE,
    contract_number TEXT, -- This stores the poliza ID (extracted "poliza" value)
    capture_date DATE,
    project_name TEXT,
    insured_amount TEXT,
    annual_premium TEXT,
    payment_method TEXT,
    currency TEXT,
    exchange_rate NUMERIC,
    payment_channel TEXT,
    folder_key TEXT,
    status TEXT DEFAULT 'PENDING',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for contract
CREATE INDEX IF NOT EXISTS idx_contract_consultant_id ON contract (consultant_id);

CREATE INDEX IF NOT EXISTS idx_contract_client_id ON contract (client_id);

CREATE INDEX IF NOT EXISTS idx_contract_contract_number ON contract (contract_number);

CREATE INDEX IF NOT EXISTS idx_contract_status ON contract (status);

CREATE INDEX IF NOT EXISTS idx_contract_created_at ON contract (created_at DESC);

-- ============================================
-- 4.5. CONTRACT DETAILS TABLE
-- ============================================
-- Stores row-level details for contracts (multiple rows per contract)
-- Only selected columns from the commission HTML: fecha emision, fecha pago, prima pago, forma pago, comision honorarios, comision %, prima cobro, antiguedad, prima meta, movimiento, prima comision
CREATE TABLE IF NOT EXISTS contract_detail (
    id UUID DEFAULT gen_random_uuid () PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
    issue_date DATE, -- FECHA EMISION
    payment_date DATE, -- FECHA PAGO
    premium_payment NUMERIC, -- PRIMA PAGO
    payment_method TEXT, -- FORMA DE PAGO
    commission_honoraries NUMERIC, -- COMISION/HONORARIOS
    commission_percentage NUMERIC, -- % COMISION
    collection_premium NUMERIC, -- PRIMA COBRO
    seniority TEXT, -- ANTIGÜEDAD
    target_premium NUMERIC, -- PRIMA META
    movement TEXT, -- MOVIMIENTO
    commission_premium NUMERIC, -- PRIMA COMISION
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT NOW()
);

-- Indexes for contract_detail
CREATE INDEX IF NOT EXISTS idx_contract_detail_contract_id ON contract_detail (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_detail_payment_date ON contract_detail (payment_date);

CREATE INDEX IF NOT EXISTS idx_contract_detail_issue_date ON contract_detail (issue_date);

CREATE INDEX IF NOT EXISTS idx_contract_detail_created_at ON contract_detail (created_at DESC);

-- ============================================
-- 5. CONTRACT CHANGE REQUEST TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS contract_change_request (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
    request_type TEXT NOT NULL CHECK (request_type IN ('CHANGE', 'CORRECT')),
    folio_number TEXT,
    details TEXT,
    notes TEXT,
    folder_key TEXT,
    status TEXT DEFAULT 'PENDING',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for contract_change_request
CREATE INDEX IF NOT EXISTS idx_contract_change_request_contract_id ON contract_change_request (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_change_request_request_type ON contract_change_request (request_type);

CREATE INDEX IF NOT EXISTS idx_contract_change_request_status ON contract_change_request (status);

CREATE INDEX IF NOT EXISTS idx_contract_change_request_created_at ON contract_change_request (created_at DESC);

-- ============================================
-- 6. FILE TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS file (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    file_url TEXT,
    status TEXT DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for file
CREATE INDEX IF NOT EXISTS idx_file_file_name ON file (file_name);

CREATE INDEX IF NOT EXISTS idx_file_file_type ON file (file_type);

CREATE INDEX IF NOT EXISTS idx_file_status ON file (status);

CREATE INDEX IF NOT EXISTS idx_file_created_at ON file (created_at DESC);

-- ============================================
-- 7. UPDATED_AT TRIGGER FUNCTION
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
-- 6. TRIGGERS FOR UPDATED_AT
-- ============================================
DROP TRIGGER IF EXISTS update_office_updated_at ON office;

CREATE TRIGGER update_office_updated_at
    BEFORE UPDATE ON office
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_consultant_updated_at ON consultant;

CREATE TRIGGER update_consultant_updated_at
    BEFORE UPDATE ON consultant
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_token_updated_at ON token;

CREATE TRIGGER update_token_updated_at
    BEFORE UPDATE ON token
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_contract_updated_at ON contract;

CREATE TRIGGER update_contract_updated_at
    BEFORE UPDATE ON contract
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_contract_change_request_updated_at ON contract_change_request;

CREATE TRIGGER update_contract_change_request_updated_at
    BEFORE UPDATE ON contract_change_request
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_file_updated_at ON file;

CREATE TRIGGER update_file_updated_at
    BEFORE UPDATE ON file
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_client_updated_at ON client;

CREATE TRIGGER update_client_updated_at
    BEFORE UPDATE ON client
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

DROP TRIGGER IF EXISTS update_contract_detail_updated_at ON contract_detail;

CREATE TRIGGER update_contract_detail_updated_at
    BEFORE UPDATE ON contract_detail
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- ============================================
-- 7. DATABASE FUNCTIONS
-- ============================================

-- Create office function
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
    INSERT INTO office (id, email, name)
    VALUES (user_id, user_email, office_name)
    ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Create consultant function
-- Now updates auth_user_id if consultant exists, or creates new consultant
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
    -- Try to find existing consultant by email or name in the same office
    UPDATE consultant
    SET
        auth_user_id = user_id,
        email = COALESCE(consultant.email, user_email),
        consultant_code = COALESCE(consultant.consultant_code, consultant_code)
    WHERE (email = user_email OR name = consultant_name)
    AND office_id = office_id_param
    AND auth_user_id IS NULL;

    -- If no consultant was updated, create a new one
    IF NOT FOUND THEN
        INSERT INTO consultant (auth_user_id, email, name, consultant_code, office_id)
        VALUES (user_id, user_email, consultant_name, consultant_code, office_id_param)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

-- Create invitation token function
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
    -- Generate a secure random token using UUIDs (works without pgcrypto)
    -- Concatenate two UUIDs and remove dashes to create a 64-character token
    uuid1 := replace(gen_random_uuid()::TEXT, '-', '');
    uuid2 := replace(gen_random_uuid()::TEXT, '-', '');
    new_token := uuid1 || uuid2;

    -- Make it URL-safe by replacing problematic characters
    new_token := replace(replace(replace(new_token, '+', '-'), '/', '_'), '=', '');

    -- Insert token with consultant info in metadata
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

-- Mark token as used function
CREATE OR REPLACE FUNCTION public.mark_token_as_used(
    token_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
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

-- Grant execute permissions
GRANT
EXECUTE ON FUNCTION public.create_office (UUID, TEXT, TEXT) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.create_office (UUID, TEXT, TEXT) TO anon;

GRANT
EXECUTE ON FUNCTION public.create_consultant (UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.create_consultant (UUID, TEXT, TEXT, TEXT, UUID) TO anon;

GRANT
EXECUTE ON FUNCTION public.create_invitation_token (
    UUID,
    TEXT,
    TEXT,
    TEXT,
    INTEGER
) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.create_invitation_token (TEXT, UUID, TEXT, TEXT, TEXT) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.create_invitation_token (TEXT, UUID, TEXT, TEXT, TEXT) TO anon;

GRANT
EXECUTE ON FUNCTION public.mark_token_as_used (UUID) TO authenticated;

GRANT EXECUTE ON FUNCTION public.mark_token_as_used (UUID) TO anon;

-- ============================================
-- 7.1. DASHBOARD RPCs (with optional date range on contract_detail.payment_date or issue_date)
-- ============================================
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.get_consultant_totals(
    consultant_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    seniority_param text DEFAULT NULL
)
RETURNS TABLE(total_prima_pago numeric, total_prima_meta numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(SUM(cd.premium_payment), 0)::numeric, COALESCE(SUM(cd.target_premium), 0)::numeric
  FROM contract_detail cd
  JOIN contract c ON c.id = cd.contract_id
  WHERE c.consultant_id = consultant_id_param
    AND ((start_date IS NULL AND end_date IS NULL) OR ((start_date IS NULL OR cd.payment_date >= start_date) AND (end_date IS NULL OR cd.payment_date <= end_date)))
    AND (seniority_param IS NULL OR cd.seniority = seniority_param);
$$;

CREATE OR REPLACE FUNCTION public.get_consultant_totals_by_type(
    consultant_id_param uuid,
    start_date date DEFAULT NULL,
    end_date date DEFAULT NULL,
    seniority_param text DEFAULT NULL
)
RETURNS TABLE(prima_pago_vi numeric, prima_pago_gm numeric, prima_meta_vi numeric, prima_meta_gm numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
$$;

GRANT
EXECUTE ON FUNCTION public.get_office_totals (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_office_totals (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO anon;

GRANT
EXECUTE ON FUNCTION public.get_top_consultants_by_sales (uuid, integer, date, date, text, numeric, numeric, uuid[], text, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_top_consultants_by_sales (uuid, integer, date, date, text, numeric, numeric, uuid[], text, text) TO anon;

GRANT
EXECUTE ON FUNCTION public.get_office_totals_by_type (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_office_totals_by_type (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO anon;

GRANT
EXECUTE ON FUNCTION public.get_office_consultants_sales (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_office_consultants_sales (uuid, date, date, text, numeric, numeric, uuid[], text, text) TO anon;

GRANT
EXECUTE ON FUNCTION public.get_consultant_totals (uuid, date, date, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_consultant_totals (uuid, date, date, text) TO anon;

GRANT
EXECUTE ON FUNCTION public.get_consultant_totals_by_type (uuid, date, date, text) TO authenticated;

GRANT
EXECUTE ON FUNCTION public.get_consultant_totals_by_type (uuid, date, date, text) TO anon;

-- ============================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on office
ALTER TABLE office ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Offices can view own profile" ON office;

DROP POLICY IF EXISTS "Offices can update own profile" ON office;

DROP POLICY IF EXISTS "Offices can insert own profile" ON office;

CREATE POLICY "Offices can view own profile" ON office FOR
SELECT TO authenticated USING (auth.uid () = id);

CREATE POLICY "Offices can update own profile" ON office FOR
UPDATE TO authenticated USING (auth.uid () = id);

CREATE POLICY "Offices can insert own profile" ON office FOR
INSERT
    TO authenticated
WITH
    CHECK (auth.uid () = id);

-- Enable RLS on consultant
ALTER TABLE consultant ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view own profile" ON consultant;

DROP POLICY IF EXISTS "Consultants can update own profile" ON consultant;

DROP POLICY IF EXISTS "Consultants can insert own profile" ON consultant;

DROP POLICY IF EXISTS "Offices can view their consultants" ON consultant;

DROP POLICY IF EXISTS "Offices can insert consultants" ON consultant;
DROP POLICY IF EXISTS "Offices can update their consultants" ON consultant;

CREATE POLICY "Consultants can view own profile" ON consultant FOR
SELECT TO authenticated USING (auth.uid () = id);

CREATE POLICY "Consultants can update own profile" ON consultant FOR
UPDATE TO authenticated USING (auth.uid () = id);

CREATE POLICY "Consultants can insert own profile" ON consultant FOR
INSERT
    TO authenticated
WITH
    CHECK (auth.uid () = id);

CREATE POLICY "Offices can view their consultants" ON consultant FOR
SELECT TO authenticated USING (
        office_id IN (
            SELECT id
            FROM office
            WHERE
                id = auth.uid ()
        )
    );

CREATE POLICY "Offices can insert consultants" ON consultant FOR
INSERT
    TO authenticated
WITH
    CHECK (
        office_id IN (
            SELECT id
            FROM office
            WHERE
                id = auth.uid ()
        )
    );

CREATE POLICY "Offices can update their consultants" ON consultant FOR
UPDATE TO authenticated USING (
    office_id = auth.uid ()
);

-- Enable RLS on token
ALTER TABLE token ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view tokens" ON token;

DROP POLICY IF EXISTS "Authenticated users can insert tokens" ON token;

DROP POLICY IF EXISTS "Anyone can view unused tokens by token value" ON token;

DROP POLICY IF EXISTS "Anyone can update token when used" ON token;

CREATE POLICY "Authenticated users can view tokens" ON token FOR
SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert tokens" ON token FOR
INSERT
    TO authenticated
WITH
    CHECK (
        (metadata ? 'office_id')
        AND (metadata ->> 'office_id')::uuid = auth.uid ()
    );

CREATE POLICY "Anyone can view unused tokens by token value" ON token FOR
SELECT TO anon USING (
        used_at IS NULL
        AND expires_at > NOW()
        AND status = 'ACTIVE'
    );

CREATE POLICY "Anyone can update token when used" ON token FOR
UPDATE TO anon USING (
    used_at IS NULL
    AND expires_at > NOW()
    AND status = 'ACTIVE'
)
WITH
    CHECK (
        used_at IS NOT NULL
        AND status = 'USED'
    );

-- Allow authenticated users to update tokens (for marking as used after signup)
CREATE POLICY "Authenticated users can update tokens" ON token FOR
UPDATE TO authenticated USING (
    used_at IS NULL
    AND expires_at > NOW()
    AND status = 'ACTIVE'
)
WITH
    CHECK (
        used_at IS NOT NULL
        AND status = 'USED'
    );

-- Enable RLS on client
ALTER TABLE client ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view clients" ON client;

DROP POLICY IF EXISTS "Authenticated users can insert clients" ON client;

DROP POLICY IF EXISTS "Authenticated users can update clients" ON client;

DROP POLICY IF EXISTS "Authenticated users can delete clients" ON client;

-- Offices see clients for their office; consultants see clients from their contracts
CREATE POLICY "Authenticated users can view clients" ON client FOR
SELECT TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = auth.uid())
    OR id IN (SELECT client_id FROM contract WHERE consultant_id = auth.uid() AND client_id IS NOT NULL)
);

-- Offices and consultants can insert clients for their office
CREATE POLICY "Authenticated users can insert clients" ON client FOR
INSERT
    TO authenticated
WITH
    CHECK (
        office_id IN (SELECT id FROM office WHERE id = auth.uid())
        OR office_id IN (SELECT office_id FROM consultant WHERE id = auth.uid())
    );

CREATE POLICY "Authenticated users can update clients" ON client FOR
UPDATE TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = auth.uid())
    OR id IN (SELECT client_id FROM contract WHERE consultant_id = auth.uid() AND client_id IS NOT NULL)
)
WITH
    CHECK (
        office_id IN (SELECT id FROM office WHERE id = auth.uid())
        OR office_id IN (SELECT office_id FROM consultant WHERE id = auth.uid())
    );

CREATE POLICY "Authenticated users can delete clients" ON client FOR DELETE TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = auth.uid())
    OR id IN (SELECT client_id FROM contract WHERE consultant_id = auth.uid() AND client_id IS NOT NULL)
);

-- Enable RLS on contract
ALTER TABLE contract ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view own contracts" ON contract;

DROP POLICY IF EXISTS "Consultants can insert own contracts" ON contract;

DROP POLICY IF EXISTS "Consultants can update own contracts" ON contract;

DROP POLICY IF EXISTS "Offices can view their consultants contracts" ON contract;

DROP POLICY IF EXISTS "Offices can insert contracts for consultants" ON contract;

DROP POLICY IF EXISTS "Offices can update their consultants contracts" ON contract;

CREATE POLICY "Consultants can view own contracts" ON contract FOR
SELECT TO authenticated USING (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                id = auth.uid ()
        )
    );

CREATE POLICY "Consultants can insert own contracts" ON contract FOR
INSERT
    TO authenticated
WITH
    CHECK (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                id = auth.uid ()
        )
    );

CREATE POLICY "Consultants can update own contracts" ON contract FOR
UPDATE TO authenticated USING (
    consultant_id IN (
        SELECT id
        FROM consultant
        WHERE
            id = auth.uid ()
    )
)
WITH
    CHECK (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                id = auth.uid ()
        )
    );

CREATE POLICY "Offices can view their consultants contracts" ON contract FOR
SELECT TO authenticated USING (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                office_id IN (
                    SELECT id
                    FROM office
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Offices can insert contracts for consultants" ON contract FOR
INSERT
    TO authenticated
WITH
    CHECK (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                office_id IN (
                    SELECT id
                    FROM office
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Offices can update their consultants contracts" ON contract FOR
UPDATE TO authenticated USING (
    consultant_id IN (
        SELECT id
        FROM consultant
        WHERE
            office_id IN (
                SELECT id
                FROM office
                WHERE
                    id = auth.uid ()
            )
    )
)
WITH
    CHECK (
        consultant_id IN (
            SELECT id
            FROM consultant
            WHERE
                office_id IN (
                    SELECT id
                    FROM office
                    WHERE
                        id = auth.uid ()
                )
        )
    );

-- Enable RLS on contract_detail
ALTER TABLE contract_detail ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view own contract details" ON contract_detail;

DROP POLICY IF EXISTS "Consultants can insert own contract details" ON contract_detail;

DROP POLICY IF EXISTS "Offices can view their consultants contract details" ON contract_detail;

DROP POLICY IF EXISTS "Offices can insert contract details for consultants" ON contract_detail;

CREATE POLICY "Consultants can view own contract details" ON contract_detail FOR
SELECT TO authenticated USING (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Consultants can insert own contract details" ON contract_detail FOR
INSERT
    TO authenticated
WITH
    CHECK (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Offices can view their consultants contract details" ON contract_detail FOR
SELECT TO authenticated USING (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        office_id IN (
                            SELECT id
                            FROM office
                            WHERE
                                id = auth.uid ()
                        )
                )
        )
    );

CREATE POLICY "Offices can insert contract details for consultants" ON contract_detail FOR
INSERT
    TO authenticated
WITH
    CHECK (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        office_id IN (
                            SELECT id
                            FROM office
                            WHERE
                                id = auth.uid ()
                        )
                )
        )
    );

-- Enable RLS on contract_change_request
ALTER TABLE contract_change_request ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view own change requests" ON contract_change_request;

DROP POLICY IF EXISTS "Consultants can insert own change requests" ON contract_change_request;

DROP POLICY IF EXISTS "Offices can view their consultants change requests" ON contract_change_request;

DROP POLICY IF EXISTS "Offices can update their consultants change requests" ON contract_change_request;

CREATE POLICY "Consultants can view own change requests" ON contract_change_request FOR
SELECT TO authenticated USING (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Consultants can insert own change requests" ON contract_change_request FOR
INSERT
    TO authenticated
WITH
    CHECK (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        id = auth.uid ()
                )
        )
    );

CREATE POLICY "Offices can view their consultants change requests" ON contract_change_request FOR
SELECT TO authenticated USING (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        office_id IN (
                            SELECT id
                            FROM office
                            WHERE
                                id = auth.uid ()
                        )
                )
        )
    );

CREATE POLICY "Offices can update their consultants change requests" ON contract_change_request FOR
UPDATE TO authenticated USING (
    contract_id IN (
        SELECT id
        FROM contract
        WHERE
            consultant_id IN (
                SELECT id
                FROM consultant
                WHERE
                    office_id IN (
                        SELECT id
                        FROM office
                        WHERE
                            id = auth.uid ()
                    )
            )
    )
)
WITH
    CHECK (
        contract_id IN (
            SELECT id
            FROM contract
            WHERE
                consultant_id IN (
                    SELECT id
                    FROM consultant
                    WHERE
                        office_id IN (
                            SELECT id
                            FROM office
                            WHERE
                                id = auth.uid ()
                        )
                )
        )
    );

-- Enable RLS on file
ALTER TABLE file ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view files" ON file;

DROP POLICY IF EXISTS "Authenticated users can insert files" ON file;

DROP POLICY IF EXISTS "Authenticated users can update files" ON file;

DROP POLICY IF EXISTS "Authenticated users can delete files" ON file;

CREATE POLICY "Authenticated users can view files" ON file FOR
SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert files" ON file FOR
INSERT
    TO authenticated
WITH
    CHECK (EXISTS (SELECT 1 FROM office WHERE id = auth.uid ()));

CREATE POLICY "Authenticated users can update files" ON file FOR
UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM office WHERE id = auth.uid ()))
WITH
    CHECK (EXISTS (SELECT 1 FROM office WHERE id = auth.uid ()));

CREATE POLICY "Authenticated users can delete files" ON file FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM office WHERE id = auth.uid ()));