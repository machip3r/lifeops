-- One canonical póliza number so every source links to the same póliza: no spaces or commas,
-- uppercase ("vi 123,456" → "VI123456"). Same rule as `normalizeContractNumber` in the app
-- (manual registration, commission HTML, Mina de Oro, plantilla). Before this, commission imports
-- stored the number as written in the file, so a later import or a manual póliza with the same
-- number in another format was not found and was created again.
--
-- Existing data:
--   * only rows whose number changes are touched, and only when the normalized value is unique in
--     the office (counting every other póliza, normalized) — a póliza that would collide with
--     another one keeps its current number (unique index (office_id, contract_number) stays valid)
--     and is listed by the NOTICE below so it can be merged by hand;
--   * nothing is deleted; receipts, payments and documents keep pointing to the same contract id.

DO $$
DECLARE
    v_updated integer;
    v_conflicts integer;
BEGIN
    WITH numbered AS (
        SELECT
            id,
            office_id,
            contract_number,
            upper(regexp_replace(contract_number, '[[:space:],]+', '', 'g')) AS normalized
        FROM public.contract
        WHERE contract_number IS NOT NULL
    ),
    collisions AS (
        SELECT office_id, normalized
        FROM numbered
        GROUP BY office_id, normalized
        HAVING count(*) > 1
    ),
    safe AS (
        SELECT n.id, n.normalized
        FROM numbered n
        WHERE n.normalized <> n.contract_number
          AND n.normalized <> ''
          AND NOT EXISTS (
              SELECT 1 FROM collisions c
              WHERE c.office_id = n.office_id AND c.normalized = n.normalized
          )
    )
    UPDATE public.contract c
    SET contract_number = safe.normalized,
        updated_at = now()
    FROM safe
    WHERE c.id = safe.id;
    GET DIAGNOSTICS v_updated = ROW_COUNT;

    SELECT count(*) INTO v_conflicts
    FROM (
        SELECT office_id, upper(regexp_replace(contract_number, '[[:space:],]+', '', 'g')) AS normalized
        FROM public.contract
        WHERE contract_number IS NOT NULL
        GROUP BY 1, 2
        HAVING count(*) > 1
    ) dup;

    RAISE NOTICE 'contract_number normalized: % rows; % numbers left as they were (same number written twice in an office, merge by hand)',
        v_updated, v_conflicts;
END;
$$;
