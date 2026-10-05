-- Invited asesores briefly failed consultant RLS and ensurePromotoryOffice created
-- an office row with id = auth.users.id. That made the UI treat them as promotory
-- (Asesores nav, empty lists scoped to the wrong office_id).
-- Remove those phantom offices when the auth user is a linked consultant belonging
-- to a different real office.

DELETE FROM office o
USING consultant c
WHERE c.auth_user_id = o.id
  AND c.office_id IS DISTINCT FROM o.id;
