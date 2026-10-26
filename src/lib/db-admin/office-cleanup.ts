/** Promotoría full wipe (Perfil → Zona de peligro). */
import "server-only";

import { deleteAuthUser } from "@/lib/auth/admin";
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

async function deleteOfficeDocumentsAdmin(officeId: string): Promise<void> {
  const { data: officeFiles, error: filesFetchError } = await supabaseAdmin
    .from("file")
    .select("id, file_path")
    .eq("office_id", officeId);
  if (filesFetchError) {
    throw new Error("No se pudieron obtener los documentos.");
  }

  const filePaths = (officeFiles || [])
    .map((f: { file_path?: string }) => f.file_path)
    .filter((p): p is string => !!p);

  if (filePaths.length > 0) {
    const { error: storageDeleteError } = await removeDocumentObjects(filePaths);
    if (storageDeleteError) {
      console.error("Error deleting storage objects:", storageDeleteError);
    }
  }

  const { error: filesDeleteError } = await supabaseAdmin
    .from("file")
    .delete()
    .eq("office_id", officeId);
  if (filesDeleteError) {
    throw new Error("No se pudieron eliminar los documentos.");
  }
}

/**
 * Wipe office operational data (documents, contracts, consultants, clients, auth users).
 * Caller must already have asserted promotory + office access.
 */
export async function cleanupOfficeDataAdmin(
  officeId: string,
): Promise<OfficeCleanupResult> {
  const { data: consultants, error: consultantsError } = await supabaseAdmin
    .from("consultant")
    .select("id, auth_user_id")
    .eq("office_id", officeId);

  if (consultantsError) {
    throw new Error("No se pudieron obtener los asesores.");
  }

  const consultantIds = (consultants || []).map(
    (c: { id: string }) => c.id,
  );
  const authUserIds = (consultants || [])
    .map((c: { auth_user_id: string | null }) => c.auth_user_id)
    .filter((id): id is string => !!id);

  if (consultantIds.length === 0) {
    await deleteOfficeDocumentsAdmin(officeId);

    const { error: auditDeleteError } = await supabaseAdmin
      .from("audit_log")
      .delete()
      .eq("office_id", officeId);
    if (auditDeleteError) {
      throw new Error("No se pudo eliminar el historial de actividad.");
    }

    const { error: importDeleteError } = await supabaseAdmin
      .from("commission_import")
      .delete()
      .eq("office_id", officeId);
    if (importDeleteError) {
      throw new Error("No se pudieron eliminar los lotes de importación.");
    }

    const { error: clientsDeleteError } = await supabaseAdmin
      .from("client")
      .delete()
      .eq("office_id", officeId);
    if (clientsDeleteError) {
      throw new Error("No se pudieron eliminar los clientes.");
    }

    return {
      success: true,
      deletedContracts: 0,
      deletedConsultants: 0,
      deletedClients: true,
      deletedAuthUsers: 0,
      deletedCollectionData: true,
    };
  }

  const { data: contracts, error: contractsError } = await supabaseAdmin
    .from("contract")
    .select("id")
    .in("consultant_id", consultantIds);

  if (contractsError) {
    throw new Error("No se pudieron obtener las pólizas.");
  }

  const contractIds = (contracts || []).map((c: { id: string }) => c.id);

  await deleteOfficeDocumentsAdmin(officeId);

  if (contractIds.length > 0) {
    const { error: paymentsError } = await supabaseAdmin
      .from("contract_collection_payment")
      .delete()
      .in("contract_id", contractIds);
    if (paymentsError) {
      throw new Error("No se pudieron eliminar los pagos de cobranza.");
    }

    const { error: ccrError } = await supabaseAdmin
      .from("contract_change_request")
      .delete()
      .in("contract_id", contractIds);
    if (ccrError) {
      throw new Error("No se pudieron eliminar las solicitudes de cambio.");
    }

    const { error: detailsError } = await supabaseAdmin
      .from("contract_detail")
      .delete()
      .in("contract_id", contractIds);
    if (detailsError) {
      throw new Error("No se pudieron eliminar los detalles de póliza.");
    }

    const { error: contractsDeleteError } = await supabaseAdmin
      .from("contract")
      .delete()
      .in("id", contractIds);
    if (contractsDeleteError) {
      throw new Error("No se pudieron eliminar las pólizas.");
    }
  }

  const { error: auditDeleteError } = await supabaseAdmin
    .from("audit_log")
    .delete()
    .eq("office_id", officeId);
  if (auditDeleteError) {
    throw new Error("No se pudo eliminar el historial de actividad.");
  }

  const { error: importDeleteError } = await supabaseAdmin
    .from("commission_import")
    .delete()
    .eq("office_id", officeId);
  if (importDeleteError) {
    throw new Error("No se pudieron eliminar los lotes de importación.");
  }

  const { error: clientsDeleteError } = await supabaseAdmin
    .from("client")
    .delete()
    .eq("office_id", officeId);
  if (clientsDeleteError) {
    throw new Error("No se pudieron eliminar los clientes.");
  }

  const { error: consultantsDeleteError } = await supabaseAdmin
    .from("consultant")
    .delete()
    .in("id", consultantIds);
  if (consultantsDeleteError) {
    throw new Error("No se pudieron eliminar los asesores.");
  }

  let deletedAuthCount = 0;
  for (const uid of authUserIds) {
    const { error: authDeleteError } = await deleteAuthUser(uid);
    if (authDeleteError) {
      console.error(`cleanupOfficeDataAdmin: auth user ${uid}:`, authDeleteError);
    } else {
      deletedAuthCount += 1;
    }
  }

  return {
    success: true,
    deletedContracts: contractIds.length,
    deletedConsultants: consultantIds.length,
    deletedClients: true,
    deletedAuthUsers: deletedAuthCount,
    deletedCollectionData: true,
  };
}
