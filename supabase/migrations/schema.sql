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

CREATE UNIQUE INDEX IF NOT EXISTS consultant_code_unique ON consultant (consultant_code)
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
    client_id UUID REFERENCES client (id) ON DELETE SET NULL,
    contract_number TEXT, -- This stores the poliza ID (extracted "poliza" value)
    capture_date DATE,
    project_name TEXT,
    insured_amount TEXT,
    annual_premium TEXT,
    payment_method TEXT,
    currency TEXT,
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
-- Each row in the HTML table becomes a contract_detail record
CREATE TABLE IF NOT EXISTS contract_detail (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
    ticket_number TEXT, -- RECIBO
    plan TEXT, -- PLAN
    issue_date DATE, -- FECHA EMISION
    product TEXT, -- PRODUCTO
    expiration_date DATE, -- FECHA VENCIMIENTO
    payment_date DATE, -- FECHA PAGO
    premium_payment TEXT, -- PRIMA PAGO
    payment_method TEXT, -- FORMA DE PAGO
    unit_value TEXT, -- U.V.
    participation_percentage TEXT, -- PORCENTAJE PARTICIPACION
    commission_premium TEXT, -- PRIMA COMISION
    commission_honoraries TEXT, -- COMISION/HONORARIOS
    condition TEXT, -- CONDICION
    commission_percentage TEXT, -- % COMISION
    movement TEXT, -- MOVIMIENTO
    collection_premium TEXT, -- PRIMA COBRO
    promotional_collection_premium TEXT, -- PRIMA COBRO PROM
    incremental_premium TEXT, -- PRIMA INCREMENTAL
    seniority TEXT, -- ANTIGÜEDAD
    generation_date DATE, -- FECHA GENERACION
    group_name TEXT, -- GRUPO
    index_premium TEXT, -- PRIMA INDICE
    target_premium TEXT, -- PRIMA META
    row_data JSONB DEFAULT '{}'::jsonb, -- Store any additional columns dynamically
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for contract_detail
CREATE INDEX IF NOT EXISTS idx_contract_detail_contract_id ON contract_detail (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_detail_ticket_number ON contract_detail (ticket_number);

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
EXECUTE ON FUNCTION public.create_invitation_token (
    UUID,
    TEXT,
    TEXT,
    TEXT,
    INTEGER
) TO anon;

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
    CHECK (true);

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

-- Allow all authenticated users (consultants) to manage clients
CREATE POLICY "Authenticated users can view clients" ON client FOR
SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert clients" ON client FOR
INSERT
    TO authenticated
WITH
    CHECK (true);

CREATE POLICY "Authenticated users can update clients" ON client FOR
UPDATE TO authenticated USING (true)
WITH
    CHECK (true);

CREATE POLICY "Authenticated users can delete clients" ON client FOR DELETE TO authenticated USING (true);

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
    CHECK (true);

CREATE POLICY "Authenticated users can update files" ON file FOR
UPDATE TO authenticated USING (true)
WITH
    CHECK (true);

CREATE POLICY "Authenticated users can delete files" ON file FOR DELETE TO authenticated USING (true);