-- Fix ambiguous consultant_code in create_consultant (param vs column → 42702).
-- DROP + CREATE required: CREATE OR REPLACE cannot rename input parameters.

DROP FUNCTION IF EXISTS public.create_consultant(UUID, TEXT, TEXT, TEXT, UUID);

CREATE FUNCTION public.create_consultant(
    user_id UUID,
    user_email TEXT,
    consultant_name TEXT,
    consultant_code_param TEXT,
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

    UPDATE consultant AS c
    SET
        auth_user_id = user_id,
        email = COALESCE(c.email, user_email),
        name = COALESCE(NULLIF(BTRIM(c.name), ''), consultant_name),
        consultant_code = COALESCE(c.consultant_code, consultant_code_param)
    WHERE c.office_id = office_id_param
      AND c.auth_user_id IS NULL
      AND (
          c.email = user_email
          OR c.name = consultant_name
          OR c.consultant_code = consultant_code_param
      );

    IF NOT FOUND THEN
        INSERT INTO consultant (auth_user_id, email, name, consultant_code, office_id)
        VALUES (user_id, user_email, consultant_name, consultant_code_param, office_id_param)
        ON CONFLICT DO NOTHING;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.create_consultant(UUID, TEXT, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_consultant(UUID, TEXT, TEXT, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_consultant(UUID, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_consultant(UUID, TEXT, TEXT, TEXT, UUID) TO service_role;
