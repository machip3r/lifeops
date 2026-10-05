-- Drop outdated table comment on contract_reassignment_log.
-- Reassignment history will fold into a general audit_log (see docs/audit-log-plan.md).

COMMENT ON TABLE contract_reassignment_log IS NULL;
