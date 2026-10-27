/** Hard delete of pólizas (asesor / cliente / póliza deletes). Callers authorize tenancy first. */
import "server-only";

import { IMPORT_BATCH_SIZE, chunkArray } from "@/lib/extractor/batch";
import { removeDocumentObjects } from "@/lib/storage/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * Removes the pólizas' documents from Storage, then the rows. Detalles, cobranza marks,
 * solicitudes and `file` rows go with them (ON DELETE CASCADE); `audit_log` is kept.
 */
export async function deleteContractsCascadeAdmin(contractIds: string[]): Promise<number> {
  const ids = [...new Set(contractIds)];
  let deleted = 0;
  for (const chunk of chunkArray(ids, IMPORT_BATCH_SIZE)) {
    const { data: files, error: filesError } = await supabaseAdmin
      .from("file")
      .select("file_path")
      .in("contract_id", chunk);
    if (filesError) throw filesError;
    const paths = (files ?? []).map((f: { file_path: string | null }) => f.file_path).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: storageError } = await removeDocumentObjects(paths);
      // Rows still go; an orphaned object is better than a póliza that cannot be deleted
      if (storageError) console.error("deleteContractsCascadeAdmin storage:", storageError);
    }

    const { error, count } = await supabaseAdmin.from("contract").delete({ count: "exact" }).in("id", chunk);
    if (error) throw error;
    deleted += count ?? 0;
  }
  return deleted;
}
