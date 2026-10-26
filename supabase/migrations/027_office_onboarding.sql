-- Promotoría onboarding: signup (correo + contraseña) → onboarding stepper → dashboard.
-- Multi-choice answers use catalog tables + join tables; single-choice answers are
-- CHECK-constrained codes on `office` (labels live in the app).

-- ============================================
-- 1. Catalogs (read-only for the app)
-- ============================================
CREATE TABLE IF NOT EXISTS mx_state (
    code CHAR(3) PRIMARY KEY CHECK (code ~ '^[A-Z]{3}$'),
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS insurer (
    code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
    name TEXT NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL
);

CREATE TABLE IF NOT EXISTS line_of_business (
    code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z][A-Z0-9_]{0,31}$'),
    name TEXT NOT NULL UNIQUE,
    sort_order SMALLINT NOT NULL
);

-- ISO 3166-2:MX
INSERT INTO mx_state (code, name) VALUES
    ('AGU', 'Aguascalientes'),
    ('BCN', 'Baja California'),
    ('BCS', 'Baja California Sur'),
    ('CAM', 'Campeche'),
    ('CHP', 'Chiapas'),
    ('CHH', 'Chihuahua'),
    ('CMX', 'Ciudad de México'),
    ('COA', 'Coahuila'),
    ('COL', 'Colima'),
    ('DUR', 'Durango'),
    ('MEX', 'Estado de México'),
    ('GUA', 'Guanajuato'),
    ('GRO', 'Guerrero'),
    ('HID', 'Hidalgo'),
    ('JAL', 'Jalisco'),
    ('MIC', 'Michoacán'),
    ('MOR', 'Morelos'),
    ('NAY', 'Nayarit'),
    ('NLE', 'Nuevo León'),
    ('OAX', 'Oaxaca'),
    ('PUE', 'Puebla'),
    ('QUE', 'Querétaro'),
    ('ROO', 'Quintana Roo'),
    ('SLP', 'San Luis Potosí'),
    ('SIN', 'Sinaloa'),
    ('SON', 'Sonora'),
    ('TAB', 'Tabasco'),
    ('TAM', 'Tamaulipas'),
    ('TLA', 'Tlaxcala'),
    ('VER', 'Veracruz'),
    ('YUC', 'Yucatán'),
    ('ZAC', 'Zacatecas')
ON CONFLICT (code) DO NOTHING;

INSERT INTO insurer (code, name, sort_order) VALUES
    ('MONTERREY_NYL', 'Seguros Monterrey New York Life', 1),
    ('GNP', 'GNP Seguros', 2),
    ('METLIFE', 'MetLife', 3),
    ('AXA', 'AXA', 4),
    ('ALLIANZ', 'Allianz', 5),
    ('ZURICH', 'Zurich', 6),
    ('MAPFRE', 'Mapfre', 7),
    ('BANORTE', 'Seguros Banorte', 8),
    ('OTHER', 'Otra', 99)
ON CONFLICT (code) DO NOTHING;

INSERT INTO line_of_business (code, name, sort_order) VALUES
    ('LIFE', 'Vida', 1),
    ('HEALTH', 'Gastos médicos', 2),
    ('SAVINGS', 'Ahorro / retiro', 3),
    ('AUTO', 'Autos', 4),
    ('PROPERTY', 'Daños', 5),
    ('OTHER', 'Otro', 99)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- 2. office: 1:1 onboarding answers + progress
-- ============================================
-- Signup no longer asks the promotoría name; onboarding step 1 fills it.
ALTER TABLE office ALTER COLUMN name DROP NOT NULL;

ALTER TABLE office
    ADD COLUMN IF NOT EXISTS agency_code TEXT,
    ADD COLUMN IF NOT EXISTS state_code CHAR(3) REFERENCES mx_state (code),
    ADD COLUMN IF NOT EXISTS consultant_count_range TEXT,
    ADD COLUMN IF NOT EXISTS active_policy_range TEXT,
    ADD COLUMN IF NOT EXISTS primary_goal TEXT,
    ADD COLUMN IF NOT EXISTS onboarding_step SMALLINT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS onboarding_version SMALLINT,
    ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;

ALTER TABLE office
    ADD CONSTRAINT office_agency_code_check
        CHECK (agency_code IS NULL OR agency_code ~ '^[A-Za-z0-9][A-Za-z0-9._/-]{0,31}$'),
    ADD CONSTRAINT office_consultant_count_range_check
        CHECK (consultant_count_range IS NULL OR consultant_count_range IN ('1_5', '6_20', '21_50', '51_100', '100_PLUS')),
    ADD CONSTRAINT office_active_policy_range_check
        CHECK (active_policy_range IS NULL OR active_policy_range IN ('LT_100', '100_500', '500_2000', '2000_10000', 'GT_10000')),
    ADD CONSTRAINT office_primary_goal_check
        CHECK (primary_goal IS NULL OR primary_goal IN ('COLLECTIONS', 'COMMISSIONS', 'CONSULTANTS', 'ALL')),
    ADD CONSTRAINT office_onboarding_step_check
        CHECK (onboarding_step BETWEEN 0 AND 3),
    ADD CONSTRAINT office_onboarding_complete_check
        CHECK (
            onboarding_completed_at IS NULL
            OR (
                name IS NOT NULL AND btrim(name) <> ''
                AND state_code IS NOT NULL
                AND consultant_count_range IS NOT NULL
                AND active_policy_range IS NOT NULL
                AND onboarding_version IS NOT NULL
            )
        );

COMMENT ON COLUMN office.agency_code IS 'Clave de promotoría; locked for the app once onboarding is complete (support can change it).';
COMMENT ON COLUMN office.onboarding_step IS 'Last onboarding step saved (0 = none, 3 = all).';
COMMENT ON COLUMN office.onboarding_completed_at IS 'NULL = promotoría must finish onboarding before using the dashboard.';

-- Clave de promotoría: app users can set it while empty or before finishing onboarding.
CREATE OR REPLACE FUNCTION public.office_lock_agency_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user = 'authenticated'
        AND OLD.onboarding_completed_at IS NOT NULL
        AND OLD.agency_code IS NOT NULL
        AND NEW.agency_code IS DISTINCT FROM OLD.agency_code THEN
        RAISE EXCEPTION 'agency_code_locked' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS office_lock_agency_code ON office;
CREATE TRIGGER office_lock_agency_code
    BEFORE UPDATE OF agency_code ON office
    FOR EACH ROW
    EXECUTE FUNCTION public.office_lock_agency_code();

-- ============================================
-- 3. Contacts: who registered + the owner when it is someone else
-- ============================================
CREATE TABLE IF NOT EXISTS office_contact (
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('REGISTRANT', 'OWNER')),
    full_name TEXT NOT NULL CHECK (btrim(full_name) <> '' AND char_length(full_name) <= 120),
    -- Only for REGISTRANT: their role in the promotoría
    job_role TEXT CHECK (job_role IN ('OWNER', 'DIRECTOR', 'OPERATIONS_MANAGER', 'ASSISTANT', 'OTHER')),
    phone TEXT NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (office_id, kind),
    CONSTRAINT office_contact_registrant_role_check CHECK ((kind = 'REGISTRANT') = (job_role IS NOT NULL))
);

DROP TRIGGER IF EXISTS update_office_contact_updated_at ON office_contact;
CREATE TRIGGER update_office_contact_updated_at
    BEFORE UPDATE ON office_contact
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- ============================================
-- 4. Multi-choice answers
-- ============================================
CREATE TABLE IF NOT EXISTS office_insurer (
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    insurer_code TEXT NOT NULL REFERENCES insurer (code),
    -- Free text only for insurer_code = 'OTHER'
    other_name TEXT CHECK (other_name IS NULL OR (btrim(other_name) <> '' AND char_length(other_name) <= 80)),
    PRIMARY KEY (office_id, insurer_code),
    CONSTRAINT office_insurer_other_only_check CHECK ((insurer_code = 'OTHER') = (other_name IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS office_line_of_business (
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    line_code TEXT NOT NULL REFERENCES line_of_business (code),
    PRIMARY KEY (office_id, line_code)
);

-- Reverse lookups ("promotorías que trabajan con GNP"); PKs already cover office_id.
CREATE INDEX IF NOT EXISTS idx_office_insurer_insurer_code ON office_insurer (insurer_code);
CREATE INDEX IF NOT EXISTS idx_office_line_of_business_line_code ON office_line_of_business (line_code);
CREATE INDEX IF NOT EXISTS idx_office_state_code ON office (state_code);

-- ============================================
-- 5. RLS
-- ============================================
ALTER TABLE mx_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE insurer ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_of_business ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_insurer ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_line_of_business ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read states" ON mx_state;
CREATE POLICY "Authenticated can read states" ON mx_state
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read insurers" ON insurer;
CREATE POLICY "Authenticated can read insurers" ON insurer
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can read lines of business" ON line_of_business;
CREATE POLICY "Authenticated can read lines of business" ON line_of_business
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Offices manage own contacts" ON office_contact;
CREATE POLICY "Offices manage own contacts" ON office_contact
    FOR ALL TO authenticated
    USING (office_id = (SELECT auth.uid()))
    WITH CHECK (office_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Offices manage own insurers" ON office_insurer;
CREATE POLICY "Offices manage own insurers" ON office_insurer
    FOR ALL TO authenticated
    USING (office_id = (SELECT auth.uid()))
    WITH CHECK (office_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Offices manage own lines of business" ON office_line_of_business;
CREATE POLICY "Offices manage own lines of business" ON office_line_of_business
    FOR ALL TO authenticated
    USING (office_id = (SELECT auth.uid()))
    WITH CHECK (office_id = (SELECT auth.uid()));

-- ============================================
-- 6. Save RPCs (one transaction per step; SECURITY INVOKER → RLS applies)
--    Used by onboarding and by Perfil.
-- ============================================
CREATE OR REPLACE FUNCTION public.save_office_onboarding_profile(
    p_name TEXT,
    p_state_code TEXT,
    p_agency_code TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
    UPDATE office
    SET name = btrim(p_name),
        state_code = p_state_code,
        -- Locked once captured and onboarding is complete; keep it silently
        agency_code = CASE
            WHEN onboarding_completed_at IS NOT NULL AND agency_code IS NOT NULL THEN agency_code
            ELSE NULLIF(btrim(p_agency_code), '')
        END,
        onboarding_step = GREATEST(onboarding_step, 1)
    WHERE id = (SELECT auth.uid());

    IF NOT FOUND THEN
        RAISE EXCEPTION 'office_not_found' USING ERRCODE = 'P0002';
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_office_onboarding_contacts(
    p_full_name TEXT,
    p_job_role TEXT,
    p_phone TEXT,
    p_owner_name TEXT,
    p_owner_phone TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_office_id UUID := (SELECT auth.uid());
BEGIN
    UPDATE office
    SET onboarding_step = GREATEST(onboarding_step, 2)
    WHERE id = v_office_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'office_not_found' USING ERRCODE = 'P0002';
    END IF;

    INSERT INTO office_contact (office_id, kind, full_name, job_role, phone)
    VALUES (v_office_id, 'REGISTRANT', btrim(p_full_name), p_job_role, p_phone)
    ON CONFLICT (office_id, kind) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        job_role = EXCLUDED.job_role,
        phone = EXCLUDED.phone;

    IF p_job_role = 'OWNER' THEN
        DELETE FROM office_contact WHERE office_id = v_office_id AND kind = 'OWNER';
    ELSE
        IF NULLIF(btrim(p_owner_name), '') IS NULL OR p_owner_phone IS NULL THEN
            RAISE EXCEPTION 'owner_contact_required' USING ERRCODE = '23502';
        END IF;
        INSERT INTO office_contact (office_id, kind, full_name, job_role, phone)
        VALUES (v_office_id, 'OWNER', btrim(p_owner_name), NULL, p_owner_phone)
        ON CONFLICT (office_id, kind) DO UPDATE
        SET full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_office_onboarding_operation(
    p_insurer_codes TEXT[],
    p_other_insurer TEXT,
    p_line_codes TEXT[],
    p_consultant_count_range TEXT,
    p_active_policy_range TEXT,
    p_primary_goal TEXT,
    p_version SMALLINT
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_office_id UUID := (SELECT auth.uid());
    v_completed_at TIMESTAMPTZ;
BEGIN
    IF COALESCE(cardinality(p_insurer_codes), 0) = 0 OR COALESCE(cardinality(p_line_codes), 0) = 0 THEN
        RAISE EXCEPTION 'selection_required' USING ERRCODE = '23502';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM office_contact WHERE office_id = v_office_id AND kind = 'REGISTRANT'
    ) THEN
        RAISE EXCEPTION 'contacts_required' USING ERRCODE = '23502';
    END IF;

    DELETE FROM office_insurer
    WHERE office_id = v_office_id AND insurer_code <> ALL (p_insurer_codes);
    INSERT INTO office_insurer (office_id, insurer_code, other_name)
    SELECT v_office_id, code, CASE WHEN code = 'OTHER' THEN NULLIF(btrim(p_other_insurer), '') END
    FROM (SELECT DISTINCT unnest(p_insurer_codes) AS code) AS picked
    ON CONFLICT (office_id, insurer_code) DO UPDATE SET other_name = EXCLUDED.other_name;

    DELETE FROM office_line_of_business
    WHERE office_id = v_office_id AND line_code <> ALL (p_line_codes);
    INSERT INTO office_line_of_business (office_id, line_code)
    SELECT v_office_id, code FROM (SELECT DISTINCT unnest(p_line_codes) AS code) AS picked
    ON CONFLICT DO NOTHING;

    UPDATE office
    SET consultant_count_range = p_consultant_count_range,
        active_policy_range = p_active_policy_range,
        primary_goal = p_primary_goal,
        onboarding_step = 3,
        onboarding_version = GREATEST(COALESCE(onboarding_version, 0), p_version),
        onboarding_completed_at = COALESCE(onboarding_completed_at, NOW())
    WHERE id = v_office_id
    RETURNING onboarding_completed_at INTO v_completed_at;

    IF v_completed_at IS NULL THEN
        RAISE EXCEPTION 'office_not_found' USING ERRCODE = 'P0002';
    END IF;
    RETURN v_completed_at;
END;
$$;

REVOKE ALL ON FUNCTION public.save_office_onboarding_profile(TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_office_onboarding_contacts(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_office_onboarding_operation(TEXT[], TEXT, TEXT[], TEXT, TEXT, TEXT, SMALLINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_office_onboarding_profile(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_office_onboarding_contacts(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_office_onboarding_operation(TEXT[], TEXT, TEXT[], TEXT, TEXT, TEXT, SMALLINT) TO authenticated;
REVOKE ALL ON FUNCTION public.office_lock_agency_code() FROM PUBLIC, anon;
