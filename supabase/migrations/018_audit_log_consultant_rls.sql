-- Fix consultant RLS on audit_log: match by id OR auth_user_id
-- (same pattern as commission_import / hardened policies).

DROP POLICY IF EXISTS "Consultants can view audit log" ON audit_log;
CREATE POLICY "Consultants can view audit log" ON audit_log
FOR SELECT TO authenticated
USING (
  office_id IN (
    SELECT office_id
    FROM consultant
    WHERE id = (SELECT auth.uid())
       OR auth_user_id = (SELECT auth.uid())
  )
  AND (
    actor_user_id = (SELECT auth.uid())
    OR (
      entity_type = 'contract'
      AND entity_id IN (
        SELECT id
        FROM contract
        WHERE consultant_id IN (
          SELECT id
          FROM consultant
          WHERE id = (SELECT auth.uid())
             OR auth_user_id = (SELECT auth.uid())
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "Consultants can insert audit log" ON audit_log;
CREATE POLICY "Consultants can insert audit log" ON audit_log
FOR INSERT TO authenticated
WITH CHECK (
  office_id IN (
    SELECT office_id
    FROM consultant
    WHERE id = (SELECT auth.uid())
       OR auth_user_id = (SELECT auth.uid())
  )
  AND (
    actor_user_id IS NULL
    OR actor_user_id = (SELECT auth.uid())
  )
);
