-- Collections (cobranza) payment control: status, day, per-month marks, audit log.

-- ============================================
-- contract: collection fields
-- ============================================
ALTER TABLE contract
    ADD COLUMN IF NOT EXISTS collection_status TEXT NULL
        CHECK (
            collection_status IS NULL
            OR collection_status IN (
                'AMPARADO',
                'CORRIENTE',
                'FLEXIBLE',
                'FLEXIBLE_REVISAR',
                'MES',
                'PERIODO_GRACIA',
                'ATRASADO'
            )
        );

ALTER TABLE contract
    ADD COLUMN IF NOT EXISTS collection_day SMALLINT NULL
        CHECK (
            collection_day IS NULL
            OR (collection_day >= 1 AND collection_day <= 31)
        );

CREATE INDEX IF NOT EXISTS idx_contract_collection_status ON contract (collection_status);

-- ============================================
-- contract_collection_payment
-- ============================================
CREATE TABLE IF NOT EXISTS contract_collection_payment (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
    year INTEGER NOT NULL CHECK (year >= 2000 AND year <= 2100),
    month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
    scheduled_day SMALLINT NULL CHECK (
        scheduled_day IS NULL
        OR (scheduled_day >= 1 AND scheduled_day <= 31)
    ),
    paid_at DATE,
    amount NUMERIC,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    created_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (contract_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_contract_collection_payment_contract_id
    ON contract_collection_payment (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_collection_payment_year_month
    ON contract_collection_payment (year, month);

DROP TRIGGER IF EXISTS update_contract_collection_payment_updated_at ON contract_collection_payment;

CREATE TRIGGER update_contract_collection_payment_updated_at
    BEFORE UPDATE ON contract_collection_payment
    FOR EACH ROW
    EXECUTE FUNCTION handle_updated_at();

-- ============================================
-- collection_audit_log (append-only)
-- ============================================
CREATE TABLE IF NOT EXISTS collection_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
    contract_id UUID REFERENCES contract (id) ON DELETE SET NULL,
    actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
    action_type TEXT NOT NULL CHECK (
        action_type IN (
            'status_change',
            'payment_upsert',
            'payment_clear',
            'collection_day_change',
            'import_sync'
        )
    ),
    source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'import')),
    old_values JSONB DEFAULT '{}'::jsonb,
    new_values JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_audit_log_office_id
    ON collection_audit_log (office_id);

CREATE INDEX IF NOT EXISTS idx_collection_audit_log_contract_id
    ON collection_audit_log (contract_id);

CREATE INDEX IF NOT EXISTS idx_collection_audit_log_created_at
    ON collection_audit_log (created_at DESC);

-- ============================================
-- Seed payments from contract_detail for a year (SECURITY INVOKER + RLS)
-- Does not overwrite rows with source = 'manual'.
-- ============================================
CREATE OR REPLACE FUNCTION public.seed_collection_payments_from_details(year_param integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    inserted_count integer := 0;
BEGIN
    IF year_param IS NULL OR year_param < 2000 OR year_param > 2100 THEN
        RAISE EXCEPTION 'invalid year';
    END IF;

    WITH candidates AS (
        SELECT DISTINCT ON (cd.contract_id, EXTRACT(MONTH FROM cd.payment_date)::integer)
            cd.contract_id,
            year_param AS year,
            EXTRACT(MONTH FROM cd.payment_date)::integer AS month,
            EXTRACT(DAY FROM cd.payment_date)::integer AS scheduled_day,
            cd.payment_date AS paid_at,
            cd.collection_premium AS amount
        FROM contract_detail cd
        WHERE cd.payment_date IS NOT NULL
          AND EXTRACT(YEAR FROM cd.payment_date)::integer = year_param
        ORDER BY
            cd.contract_id,
            EXTRACT(MONTH FROM cd.payment_date)::integer,
            cd.payment_date DESC
    ),
    upserted AS (
        INSERT INTO contract_collection_payment (
            contract_id,
            year,
            month,
            scheduled_day,
            paid_at,
            amount,
            source
        )
        SELECT
            c.contract_id,
            c.year,
            c.month,
            c.scheduled_day,
            c.paid_at,
            c.amount,
            'import'
        FROM candidates c
        ON CONFLICT (contract_id, year, month) DO UPDATE
        SET
            scheduled_day = COALESCE(contract_collection_payment.scheduled_day, EXCLUDED.scheduled_day),
            paid_at = CASE
                WHEN contract_collection_payment.source = 'manual'
                    AND contract_collection_payment.paid_at IS NOT NULL
                THEN contract_collection_payment.paid_at
                ELSE COALESCE(contract_collection_payment.paid_at, EXCLUDED.paid_at)
            END,
            amount = CASE
                WHEN contract_collection_payment.source = 'manual'
                THEN contract_collection_payment.amount
                ELSE COALESCE(contract_collection_payment.amount, EXCLUDED.amount)
            END,
            source = CASE
                WHEN contract_collection_payment.source = 'manual' THEN 'manual'
                ELSE 'import'
            END,
            updated_at = NOW()
        WHERE contract_collection_payment.source IS DISTINCT FROM 'manual'
           OR contract_collection_payment.paid_at IS NULL
        RETURNING id
    )
    SELECT COUNT(*)::integer INTO inserted_count FROM upserted;

    -- Prefill collection_day from latest payment day when missing
    UPDATE contract co
    SET collection_day = sub.day
    FROM (
        SELECT DISTINCT ON (cd.contract_id)
            cd.contract_id,
            EXTRACT(DAY FROM cd.payment_date)::integer AS day
        FROM contract_detail cd
        WHERE cd.payment_date IS NOT NULL
        ORDER BY cd.contract_id, cd.payment_date DESC
    ) sub
    WHERE co.id = sub.contract_id
      AND co.collection_day IS NULL;

    RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_collection_payments_from_details(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_collection_payments_from_details(integer) TO authenticated;

-- ============================================
-- RLS: contract_collection_payment
-- ============================================
ALTER TABLE contract_collection_payment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can insert own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can update own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can delete own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Offices can view collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Offices can insert collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Offices can update collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Offices can delete collection payments" ON contract_collection_payment;

CREATE POLICY "Consultants can view own collection payments" ON contract_collection_payment
FOR SELECT TO authenticated
USING (
    contract_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
    )
);

CREATE POLICY "Consultants can insert own collection payments" ON contract_collection_payment
FOR INSERT TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
    )
);

CREATE POLICY "Consultants can update own collection payments" ON contract_collection_payment
FOR UPDATE TO authenticated
USING (
    contract_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
    )
)
WITH CHECK (
    contract_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
    )
);

CREATE POLICY "Consultants can delete own collection payments" ON contract_collection_payment
FOR DELETE TO authenticated
USING (
    contract_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
    )
);

CREATE POLICY "Offices can view collection payments" ON contract_collection_payment
FOR SELECT TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.office_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Offices can insert collection payments" ON contract_collection_payment
FOR INSERT TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.office_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Offices can update collection payments" ON contract_collection_payment
FOR UPDATE TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.office_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.office_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Offices can delete collection payments" ON contract_collection_payment
FOR DELETE TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.office_id = (SELECT auth.uid())
    )
);

-- ============================================
-- RLS: collection_audit_log
-- ============================================
ALTER TABLE collection_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Consultants can view collection audit" ON collection_audit_log;
DROP POLICY IF EXISTS "Consultants can insert collection audit" ON collection_audit_log;
DROP POLICY IF EXISTS "Offices can view collection audit" ON collection_audit_log;
DROP POLICY IF EXISTS "Offices can insert collection audit" ON collection_audit_log;

CREATE POLICY "Consultants can view collection audit" ON collection_audit_log
FOR SELECT TO authenticated
USING (
    office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
    AND (
        contract_id IN (
            SELECT id FROM contract
            WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
        )
        OR (contract_id IS NULL AND actor_user_id = (SELECT auth.uid()))
    )
);

CREATE POLICY "Consultants can insert collection audit" ON collection_audit_log
FOR INSERT TO authenticated
WITH CHECK (
    office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
    AND (
        contract_id IN (
            SELECT id FROM contract
            WHERE consultant_id IN (SELECT id FROM consultant WHERE id = (SELECT auth.uid()))
        )
        OR contract_id IS NULL
    )
);

CREATE POLICY "Offices can view collection audit" ON collection_audit_log
FOR SELECT TO authenticated
USING (office_id = (SELECT auth.uid()));

CREATE POLICY "Offices can insert collection audit" ON collection_audit_log
FOR INSERT TO authenticated
WITH CHECK (office_id = (SELECT auth.uid()));

GRANT SELECT, INSERT, UPDATE, DELETE ON contract_collection_payment TO authenticated;
GRANT SELECT, INSERT ON collection_audit_log TO authenticated;
