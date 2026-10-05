-- Unify collection_audit_log + contract_reassignment_log into audit_log.

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  actor_role TEXT CHECK (
    actor_role IS NULL
    OR actor_role IN ('promotory', 'consultant', 'system')
  ),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  source TEXT NOT NULL DEFAULT 'ui' CHECK (
    source IN ('ui', 'import', 'api', 'system')
  ),
  old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_office_created
  ON audit_log (office_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON audit_log (entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_created
  ON audit_log (actor_user_id, created_at DESC);

COMMENT ON TABLE audit_log IS
  'Append-only application activity log (office-scoped).';

-- Backfill from cobranza audit
INSERT INTO audit_log (
  id,
  office_id,
  actor_user_id,
  actor_role,
  action,
  entity_type,
  entity_id,
  source,
  old_values,
  new_values,
  created_at
)
SELECT
  c.id,
  c.office_id,
  c.actor_user_id,
  NULL,
  'collection.' || c.action_type,
  CASE
    WHEN c.contract_id IS NULL THEN 'office'
    ELSE 'contract'
  END,
  c.contract_id,
  CASE
    WHEN c.source = 'import' THEN 'import'
    ELSE 'ui'
  END,
  COALESCE(c.old_values, '{}'::jsonb),
  COALESCE(c.new_values, '{}'::jsonb),
  COALESCE(c.created_at, NOW())
FROM collection_audit_log c;

-- Backfill from reassignment log
INSERT INTO audit_log (
  id,
  office_id,
  actor_user_id,
  actor_role,
  action,
  entity_type,
  entity_id,
  source,
  old_values,
  new_values,
  created_at
)
SELECT
  r.id,
  r.office_id,
  r.actor_user_id,
  'promotory',
  'contract.reassign',
  'contract',
  r.contract_id,
  'api',
  jsonb_build_object('consultant_id', r.from_consultant_id),
  jsonb_build_object(
    'consultant_id', r.to_consultant_id,
    'notes', r.notes
  ),
  COALESCE(r.created_at, NOW())
FROM contract_reassignment_log r;

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Offices can view audit log" ON audit_log;
CREATE POLICY "Offices can view audit log" ON audit_log
FOR SELECT TO authenticated
USING (office_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Offices can insert audit log" ON audit_log;
CREATE POLICY "Offices can insert audit log" ON audit_log
FOR INSERT TO authenticated
WITH CHECK (office_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Consultants can view audit log" ON audit_log;
CREATE POLICY "Consultants can view audit log" ON audit_log
FOR SELECT TO authenticated
USING (
  office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
  AND (
    actor_user_id = (SELECT auth.uid())
    OR (
      entity_type = 'contract'
      AND entity_id IN (
        SELECT id FROM contract
        WHERE consultant_id IN (
          SELECT id FROM consultant WHERE id = (SELECT auth.uid())
        )
      )
    )
  )
);

DROP POLICY IF EXISTS "Consultants can insert audit log" ON audit_log;
CREATE POLICY "Consultants can insert audit log" ON audit_log
FOR INSERT TO authenticated
WITH CHECK (
  office_id IN (SELECT office_id FROM consultant WHERE id = (SELECT auth.uid()))
);

GRANT SELECT, INSERT ON audit_log TO authenticated;
GRANT ALL ON audit_log TO service_role;

-- Drop specialized logs (data already copied)
DROP TABLE IF EXISTS collection_audit_log CASCADE;
DROP TABLE IF EXISTS contract_reassignment_log CASCADE;
