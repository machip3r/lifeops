-- Perfil → «Borrar todos los datos» in one transaction.
-- The previous cleanup ran from the API with `.in('contract_id', [all ids])`: with a full cartera
-- (Mina de Oro, thousands of pólizas) the request URL is too long and the select stops at 1000 rows,
-- so it failed halfway (documents already gone, pólizas still there). This RPC deletes by office
-- in SQL, all or nothing, and returns what the API still has to remove outside the database
-- (Storage objects, Auth users).
--
-- Existing data: no schema change; only adds the function (service_role only).

CREATE OR REPLACE FUNCTION public.cleanup_office_data(office_id_param uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_consultant_ids uuid[];
    v_auth_user_ids uuid[];
    v_file_paths text[];
    v_contracts integer;
    v_consultants integer;
    v_clients integer;
BEGIN
    IF office_id_param IS NULL THEN
        RAISE EXCEPTION 'office_id_param required';
    END IF;

    SELECT
        COALESCE(array_agg(id), '{}'),
        COALESCE(array_agg(auth_user_id) FILTER (WHERE auth_user_id IS NOT NULL), '{}')
    INTO v_consultant_ids, v_auth_user_ids
    FROM consultant
    WHERE office_id = office_id_param;

    -- Storage paths of every document that goes (office files + files of its pólizas)
    SELECT COALESCE(array_agg(DISTINCT f.file_path) FILTER (WHERE f.file_path IS NOT NULL), '{}')
    INTO v_file_paths
    FROM file f
    WHERE f.office_id = office_id_param
       OR f.consultant_id = ANY (v_consultant_ids)
       OR f.contract_id IN (
           SELECT c.id FROM contract c
           WHERE c.office_id = office_id_param OR c.consultant_id = ANY (v_consultant_ids)
       );

    -- Pólizas: cascades recibos (contract_detail), cobranza payments, change requests and their files
    DELETE FROM contract
    WHERE office_id = office_id_param OR consultant_id = ANY (v_consultant_ids);
    GET DIAGNOSTICS v_contracts = ROW_COUNT;

    DELETE FROM file WHERE office_id = office_id_param OR consultant_id = ANY (v_consultant_ids);
    DELETE FROM audit_log WHERE office_id = office_id_param;
    DELETE FROM commission_import WHERE office_id = office_id_param;

    -- Clients of the office; one still used by a póliza of another office stays
    DELETE FROM client cl
    WHERE cl.office_id = office_id_param
      AND NOT EXISTS (SELECT 1 FROM contract c WHERE c.client_id = cl.id);
    GET DIAGNOSTICS v_clients = ROW_COUNT;

    DELETE FROM consultant WHERE office_id = office_id_param;
    GET DIAGNOSTICS v_consultants = ROW_COUNT;

    RETURN jsonb_build_object(
        'deleted_contracts', v_contracts,
        'deleted_consultants', v_consultants,
        'deleted_clients', v_clients,
        'auth_user_ids', to_jsonb(v_auth_user_ids),
        'file_paths', to_jsonb(v_file_paths)
    );
END;
$$;

COMMENT ON FUNCTION public.cleanup_office_data(uuid) IS
  'Promotoría full wipe in one transaction (pólizas and what cascades, documents rows, audit, imports, clients, asesores). Returns Storage paths and Auth user ids for the caller to remove. Service role only; the API authorizes.';

REVOKE ALL ON FUNCTION public.cleanup_office_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_office_data(uuid) TO service_role;
