/** Clientes: delete with their pólizas. */
import "server-only";

import { writeAuditLog } from "@/lib/db/audit-log";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteContractsCascadeAdmin } from "./contract-cascade";
import { type AdminResult } from "./result";

/**
 * Deletes a client's pólizas in the office and then the client (when no póliza of another
 * office still points to it). An asesor may only do it when every póliza is its own.
 */
export async function deleteClientCascadeAdmin(input: {
  clientId: string;
  officeId: string;
  consultantId?: string;
  actorUserId: string;
  actorRole: "promotory" | "consultant";
}): Promise<AdminResult<{ deletedContracts: number; clientDeleted: boolean }>> {
  const { data: client, error } = await supabaseAdmin
    .from("client")
    .select("id, office_id, name, curp, rfc, phone, email, birth_date")
    .eq("id", input.clientId)
    .maybeSingle();
  if (error) throw error;
  if (!client) return { ok: false, code: "not_found", error: "No encontramos al cliente." };

  const { data: contracts, error: contractsError } = await supabaseAdmin
    .from("contract")
    .select("id, consultant_id")
    .eq("client_id", input.clientId)
    .eq("office_id", input.officeId);
  if (contractsError) throw contractsError;
  const rows = (contracts ?? []) as Array<{ id: string; consultant_id: string }>;

  const linkedToOffice = client.office_id === input.officeId || rows.length > 0;
  if (!linkedToOffice) return { ok: false, code: "not_found", error: "No encontramos al cliente." };

  if (input.consultantId) {
    if (!rows.some((r) => r.consultant_id === input.consultantId)) {
      return { ok: false, code: "not_found", error: "No encontramos al cliente." };
    }
    if (rows.some((r) => r.consultant_id !== input.consultantId)) {
      return {
        ok: false,
        code: "conflict",
        error: "Este cliente también tiene pólizas de otros asesores. Pide a tu promotoría que lo elimine.",
      };
    }
  }

  const deletedContracts = await deleteContractsCascadeAdmin(rows.map((r) => r.id));

  const { count: remaining, error: remainingError } = await supabaseAdmin
    .from("contract")
    .select("id", { count: "exact", head: true })
    .eq("client_id", input.clientId);
  if (remainingError) throw remainingError;

  const clientDeleted = (remaining ?? 0) === 0;
  if (clientDeleted) {
    const { error: deleteError } = await supabaseAdmin.from("client").delete().eq("id", input.clientId);
    if (deleteError) throw deleteError;
  }

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: "client.delete",
    entityType: "client",
    entityId: input.clientId,
    source: "ui",
    oldValues: {
      name: client.name,
      curp: client.curp ?? null,
      rfc: client.rfc ?? null,
      phone: client.phone ?? null,
      email: client.email ?? null,
      birth_date: client.birth_date ?? null,
    },
    newValues: { deleted_contracts: deletedContracts, client_deleted: clientDeleted },
  });

  return { ok: true, data: { deletedContracts, clientDeleted } };
}
