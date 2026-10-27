-- Promotorías could insert and read the receipts (contract_detail) of their pólizas but not
-- update them: re-imports that change a stored receipt, and editing a receipt from the póliza
-- expediente, were rejected by RLS. Same scope as the insert policy (contract.office_id).

DROP POLICY IF EXISTS "Offices can update their contract details" ON contract_detail;
CREATE POLICY "Offices can update their contract details" ON contract_detail
FOR UPDATE TO authenticated
USING (
    contract_id IN (SELECT c.id FROM contract c WHERE c.office_id = (SELECT auth.uid()))
)
WITH CHECK (
    contract_id IN (SELECT c.id FROM contract c WHERE c.office_id = (SELECT auth.uid()))
);
