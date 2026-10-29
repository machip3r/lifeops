/** Promotoría full wipe (Perfil → Zona de peligro). */
import "server-only";

import { deleteAuthUser } from "@/lib/auth/admin";
import { chunkArray } from "@/lib/extractor/batch";
import { removeDocumentObjects } from "@/lib/storage/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OfficeCleanupResult = {
  success: true;
  deletedContracts: number;
  deletedConsultants: number;
  deletedClients: true;
  deletedAuthUsers: number;
  deletedCollectionData: true;
};

type CleanupRpcResult = {
  deleted_contracts: number;
  deleted_consultants: number;
  deleted_clients: number;
  auth_user_ids: string[];
  file_paths: string[];
};

/** Storage accepts a bounded list per request */
const STORAGE_REMOVE_BATCH = 500;

/**
 * Wipe office operational data. The database part runs in one transaction
 * (`cleanup_office_data`: all or nothing, any cartera size); then Storage objects and Auth users
 * are removed — a failure there only leaves orphans, never half the data.
 * Caller must already have asserted promotory + office access.
 */
export async function cleanupOfficeDataAdmin(officeId: string): Promise<OfficeCleanupResult> {
  const { data, error } = await supabaseAdmin.rpc("cleanup_office_data", { office_id_param: officeId });
  if (error || !data) {
    console.error("cleanup_office_data failed:", error);
    throw new Error("No se pudieron borrar los datos de la promotoría. No se borró nada; intenta de nuevo.");
  }
  const result = data as CleanupRpcResult;

  for (const paths of chunkArray(result.file_paths ?? [], STORAGE_REMOVE_BATCH)) {
    const { error: storageError } = await removeDocumentObjects(paths);
    if (storageError) console.error("cleanupOfficeDataAdmin storage:", storageError);
  }

  let deletedAuthCount = 0;
  for (const uid of result.auth_user_ids ?? []) {
    const { error: authDeleteError } = await deleteAuthUser(uid);
    if (authDeleteError) {
      console.error(`cleanupOfficeDataAdmin: auth user ${uid}:`, authDeleteError);
    } else {
      deletedAuthCount += 1;
    }
  }

  return {
    success: true,
    deletedContracts: result.deleted_contracts,
    deletedConsultants: result.deleted_consultants,
    deletedClients: true,
    deletedAuthUsers: deletedAuthCount,
    deletedCollectionData: true,
  };
}
