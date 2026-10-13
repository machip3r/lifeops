-- Commission import stored FECHA EMISION only on contract_detail.
-- Copy the earliest detail date onto the póliza when contract.issue_date is empty.

UPDATE contract AS c
SET issue_date = details.issue_date
FROM (
  SELECT contract_id, MIN(issue_date) AS issue_date
  FROM contract_detail
  WHERE issue_date IS NOT NULL
  GROUP BY contract_id
) AS details
WHERE c.id = details.contract_id
  AND c.issue_date IS NULL;
