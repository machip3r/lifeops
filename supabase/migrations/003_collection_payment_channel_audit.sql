-- Allow cobranza audit entries for payment_channel (medio de cobro) edits.

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
            'import_sync'
        )
    );
