-- Solicitud documents: private storage bucket + tenancy columns on file + RLS

-- ============================================
-- 1. Private documents bucket
-- ============================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  20971520, -- 20 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Access is via service role API only; no authenticated Storage policies.

-- ============================================
-- 2. file tenancy columns
-- ============================================
-- Orphan legacy rows (no ownership) cannot be backfilled — remove them.
DELETE FROM file;

ALTER TABLE file
  ADD COLUMN IF NOT EXISTS office_id UUID REFERENCES office (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS consultant_id UUID REFERENCES consultant (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES contract (id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS change_request_id UUID REFERENCES contract_change_request (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Empty table after DELETE — safe to enforce NOT NULL
ALTER TABLE file
  ALTER COLUMN office_id SET NOT NULL,
  ALTER COLUMN consultant_id SET NOT NULL,
  ALTER COLUMN contract_id SET NOT NULL,
  ALTER COLUMN display_name SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_file_office_id ON file (office_id);
CREATE INDEX IF NOT EXISTS idx_file_consultant_id ON file (consultant_id);
CREATE INDEX IF NOT EXISTS idx_file_contract_id ON file (contract_id);
CREATE INDEX IF NOT EXISTS idx_file_change_request_id ON file (change_request_id);

-- ============================================
-- 3. file RLS — office + consultant tenancy
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can view files" ON file;
DROP POLICY IF EXISTS "Authenticated users can insert files" ON file;
DROP POLICY IF EXISTS "Authenticated users can update files" ON file;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON file;

CREATE POLICY "Office and consultants can view own files" ON file
FOR SELECT TO authenticated
USING (
  office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
  OR consultant_id IN (
    SELECT id FROM consultant
    WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
  )
);

CREATE POLICY "Office and consultants can insert own files" ON file
FOR INSERT TO authenticated
WITH CHECK (
  (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    AND consultant_id IN (
      SELECT id FROM consultant WHERE office_id = (SELECT auth.uid())
    )
  )
  OR (
    consultant_id IN (
      SELECT id FROM consultant
      WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
    )
    AND office_id IN (
      SELECT office_id FROM consultant
      WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "Office and consultants can update own files" ON file
FOR UPDATE TO authenticated
USING (
  office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
  OR consultant_id IN (
    SELECT id FROM consultant
    WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  (
    office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
    AND consultant_id IN (
      SELECT id FROM consultant WHERE office_id = (SELECT auth.uid())
    )
  )
  OR (
    consultant_id IN (
      SELECT id FROM consultant
      WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
    )
    AND office_id IN (
      SELECT office_id FROM consultant
      WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "Office and consultants can delete own files" ON file
FOR DELETE TO authenticated
USING (
  office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid()))
  OR consultant_id IN (
    SELECT id FROM consultant
    WHERE id = (SELECT auth.uid()) OR auth_user_id = (SELECT auth.uid())
  )
);
