-- Audit log for contract reassignment between consultants (same office).

CREATE TABLE IF NOT EXISTS contract_reassignment_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  office_id UUID NOT NULL REFERENCES office (id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES contract (id) ON DELETE CASCADE,
  from_consultant_id UUID NOT NULL REFERENCES consultant (id) ON DELETE RESTRICT,
  to_consultant_id UUID NOT NULL REFERENCES consultant (id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT contract_reassignment_distinct_consultants
    CHECK (from_consultant_id IS DISTINCT FROM to_consultant_id)
);

CREATE INDEX IF NOT EXISTS idx_contract_reassignment_log_office_id
  ON contract_reassignment_log (office_id);

CREATE INDEX IF NOT EXISTS idx_contract_reassignment_log_contract_id
  ON contract_reassignment_log (contract_id);

CREATE INDEX IF NOT EXISTS idx_contract_reassignment_log_created_at
  ON contract_reassignment_log (created_at DESC);

ALTER TABLE contract_reassignment_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Office can view reassignment logs" ON contract_reassignment_log;
CREATE POLICY "Office can view reassignment logs" ON contract_reassignment_log
FOR SELECT TO authenticated
USING (office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid())));

DROP POLICY IF EXISTS "Office can insert reassignment logs" ON contract_reassignment_log;
CREATE POLICY "Office can insert reassignment logs" ON contract_reassignment_log
FOR INSERT TO authenticated
WITH CHECK (office_id IN (SELECT id FROM office WHERE id = (SELECT auth.uid())));

-- Inserts go through service role API; SELECT for office via RLS.
GRANT SELECT, INSERT ON contract_reassignment_log TO authenticated;
GRANT ALL ON contract_reassignment_log TO service_role;

COMMENT ON TABLE contract_reassignment_log IS
  'Promotory reassigns a policy to another consultant in the same office';
