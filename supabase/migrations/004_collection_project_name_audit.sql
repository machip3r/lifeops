-- Allow cobranza audit entries for project_name (nombre proyecto) edits.

ALTER TABLE collection_audit_log
    DROP CONSTRAINT IF EXISTS collection_audit_log_action_type_check;

ALTER TABLE collection_audit_log
    ADD CONSTRAINT collection_audit_log_action_type_check
    CHECK (
        action_type IN (
            'status_change',
            'payment_upsert',
            'payment_clear',
            'collection_day_change',
            'payment_channel_change',
            'project_name_change',
            'import_sync'
        )
    );
