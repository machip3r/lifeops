-- RECIBO from commission files identifies one payment receipt per póliza.
-- Re-importing a receipt updates its row instead of adding a copy.

ALTER TABLE contract_detail
  ADD COLUMN IF NOT EXISTS receipt_number TEXT;

COMMENT ON COLUMN contract_detail.receipt_number IS
  'RECIBO from the commission file; unique per contract when set.';

-- Remove copies left by uploading the same commission file more than once.
-- RECIBO was not stored before, so only rows identical in every mapped column
-- are removed, keeping the most recent one. Rows written in the same insert
-- share created_at and are kept: they may be different receipts with equal values.
DELETE FROM contract_detail AS older
USING contract_detail AS newer
WHERE older.contract_id = newer.contract_id
  AND older.id <> newer.id
  AND (newer.created_at, newer.id) > (older.created_at, older.id)
  AND newer.created_at <> older.created_at
  AND older.issue_date IS NOT DISTINCT FROM newer.issue_date
  AND older.payment_date IS NOT DISTINCT FROM newer.payment_date
  AND older.premium_payment IS NOT DISTINCT FROM newer.premium_payment
  AND older.payment_method IS NOT DISTINCT FROM newer.payment_method
  AND older.commission_honoraries IS NOT DISTINCT FROM newer.commission_honoraries
  AND older.commission_percentage IS NOT DISTINCT FROM newer.commission_percentage
  AND older.collection_premium IS NOT DISTINCT FROM newer.collection_premium
  AND NULLIF(older.seniority, '') IS NOT DISTINCT FROM NULLIF(newer.seniority, '')
  AND older.target_premium IS NOT DISTINCT FROM newer.target_premium
  AND NULLIF(older.movement, '') IS NOT DISTINCT FROM NULLIF(newer.movement, '')
  AND older.commission_premium IS NOT DISTINCT FROM newer.commission_premium;

CREATE UNIQUE INDEX IF NOT EXISTS contract_detail_contract_receipt_key
  ON contract_detail (contract_id, receipt_number);
