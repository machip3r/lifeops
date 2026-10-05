-- Invited asesores have consultant.id ≠ auth.users.id (linked via auth_user_id).
-- Baseline RLS only matched consultant.id = auth.uid(), so they could not see
-- their own profile, contracts, clients, or cobranza rows.

-- ============================================
-- office — asesores may read their promotoría (name on profile)
-- ============================================
DROP POLICY IF EXISTS "Consultants can view their office" ON office;

CREATE POLICY "Consultants can view their office" ON office
FOR SELECT TO authenticated
USING (
    id IN (
        SELECT office_id
        FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
);

-- ============================================
-- consultant
-- ============================================
DROP POLICY IF EXISTS "Consultants can view own profile" ON consultant;
DROP POLICY IF EXISTS "Consultants can update own profile" ON consultant;
DROP POLICY IF EXISTS "Consultants can insert own profile" ON consultant;

CREATE POLICY "Consultants can view own profile" ON consultant
FOR SELECT TO authenticated
USING (
    id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
);

CREATE POLICY "Consultants can update own profile" ON consultant
FOR UPDATE TO authenticated
USING (
    id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
)
WITH CHECK (
    id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
);

CREATE POLICY "Consultants can insert own profile" ON consultant
FOR INSERT TO authenticated
WITH CHECK (
    id = (SELECT auth.uid())
    OR auth_user_id = (SELECT auth.uid())
);

-- ============================================
-- contract
-- ============================================
DROP POLICY IF EXISTS "Consultants can view own contracts" ON contract;
DROP POLICY IF EXISTS "Consultants can insert own contracts" ON contract;
DROP POLICY IF EXISTS "Consultants can update own contracts" ON contract;

CREATE POLICY "Consultants can view own contracts" ON contract
FOR SELECT TO authenticated
USING (
    consultant_id IN (
        SELECT id FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can insert own contracts" ON contract
FOR INSERT TO authenticated
WITH CHECK (
    consultant_id IN (
        SELECT id FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can update own contracts" ON contract
FOR UPDATE TO authenticated
USING (
    consultant_id IN (
        SELECT id FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    consultant_id IN (
        SELECT id FROM consultant
        WHERE id = (SELECT auth.uid())
           OR auth_user_id = (SELECT auth.uid())
    )
);

-- ============================================
-- client (SELECT still used baseline auth.uid() = consultant_id)
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view clients" ON client;
DROP POLICY IF EXISTS "Authenticated users can delete clients" ON client;

CREATE POLICY "Authenticated users can view clients" ON client
FOR SELECT TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR id IN (
        SELECT c.client_id
        FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE c.client_id IS NOT NULL
          AND (
              cons.id = (SELECT auth.uid())
              OR cons.auth_user_id = (SELECT auth.uid())
          )
    )
);

CREATE POLICY "Authenticated users can delete clients" ON client
FOR DELETE TO authenticated
USING (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    OR id IN (
        SELECT c.client_id
        FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE c.client_id IS NOT NULL
          AND (
              cons.id = (SELECT auth.uid())
              OR cons.auth_user_id = (SELECT auth.uid())
          )
    )
);

-- ============================================
-- contract_detail
-- ============================================
DROP POLICY IF EXISTS "Consultants can view own contract details" ON contract_detail;
DROP POLICY IF EXISTS "Consultants can insert own contract details" ON contract_detail;
DROP POLICY IF EXISTS "Consultants can update own contract details" ON contract_detail;

CREATE POLICY "Consultants can view own contract details" ON contract_detail
FOR SELECT TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can insert own contract details" ON contract_detail
FOR INSERT TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can update own contract details" ON contract_detail
FOR UPDATE TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

-- ============================================
-- contract_collection_payment
-- ============================================
DROP POLICY IF EXISTS "Consultants can view own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can insert own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can update own collection payments" ON contract_collection_payment;
DROP POLICY IF EXISTS "Consultants can delete own collection payments" ON contract_collection_payment;

CREATE POLICY "Consultants can view own collection payments" ON contract_collection_payment
FOR SELECT TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can insert own collection payments" ON contract_collection_payment
FOR INSERT TO authenticated
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can update own collection payments" ON contract_collection_payment
FOR UPDATE TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
)
WITH CHECK (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);

CREATE POLICY "Consultants can delete own collection payments" ON contract_collection_payment
FOR DELETE TO authenticated
USING (
    contract_id IN (
        SELECT c.id FROM contract c
        JOIN consultant cons ON cons.id = c.consultant_id
        WHERE cons.id = (SELECT auth.uid())
           OR cons.auth_user_id = (SELECT auth.uid())
    )
);
