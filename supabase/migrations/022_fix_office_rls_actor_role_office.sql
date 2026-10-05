-- 1) Fix infinite recursion: office SELECT policy queried consultant, and
--    consultant "Offices can …" policies queried office again (42P17).
-- 2) audit_log.actor_role: store 'office' (not 'promotory'); UI copy stays "promotoría".

-- ============================================
-- Helper: consultant's office_id without RLS (breaks office ↔ consultant cycle)
-- ============================================
CREATE OR REPLACE FUNCTION public.my_consultant_office_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT office_id
  FROM public.consultant
  WHERE (
      id = (SELECT auth.uid())
      OR auth_user_id = (SELECT auth.uid())
    )
    AND office_id IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.my_consultant_office_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_consultant_office_ids() TO authenticated;

DROP POLICY IF EXISTS "Consultants can view their office" ON office;

CREATE POLICY "Consultants can view their office" ON office
FOR SELECT TO authenticated
USING (id IN (SELECT public.my_consultant_office_ids()));

-- Office policies on consultant must not subquery office (same recursion).
DROP POLICY IF EXISTS "Offices can view their consultants" ON consultant;
DROP POLICY IF EXISTS "Offices can insert consultants" ON consultant;
DROP POLICY IF EXISTS "Offices can update their consultants" ON consultant;

CREATE POLICY "Offices can view their consultants" ON consultant
FOR SELECT TO authenticated
USING (office_id = (SELECT auth.uid()));

CREATE POLICY "Offices can insert consultants" ON consultant
FOR INSERT TO authenticated
WITH CHECK (office_id = (SELECT auth.uid()));

CREATE POLICY "Offices can update their consultants" ON consultant
FOR UPDATE TO authenticated
USING (office_id = (SELECT auth.uid()))
WITH CHECK (office_id = (SELECT auth.uid()));

-- ============================================
-- audit_log.actor_role: promotory → office
-- ============================================
ALTER TABLE audit_log
  DROP CONSTRAINT IF EXISTS audit_log_actor_role_check;

UPDATE audit_log
SET actor_role = 'office'
WHERE actor_role = 'promotory';

ALTER TABLE audit_log
  ADD CONSTRAINT audit_log_actor_role_check
  CHECK (
    actor_role IS NULL
    OR actor_role IN ('office', 'consultant', 'system')
  );
