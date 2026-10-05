-- create_office must only run as the signed-in user.
-- Previously a null auth.uid() (anon) skipped the guard; EXECUTE was revoked from
-- anon in 007, but signup still tried to call it before a session existed.
-- App now defers office creation until after session/OTP; tighten the RPC too.

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
    IF (SELECT auth.uid()) IS DISTINCT FROM user_id THEN
        RAISE EXCEPTION 'Not authorized to create office for another user';
    END IF;

    INSERT INTO office (id, email, name)
    VALUES (user_id, user_email, office_name)
    ON CONFLICT (id) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.create_office(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_office(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_office(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_office(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.create_office(UUID, TEXT, TEXT) IS
  'Creates office row for the authenticated user (auth.uid must equal user_id)';
