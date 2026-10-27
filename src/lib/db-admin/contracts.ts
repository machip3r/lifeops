/** Pólizas: lookup by number, reassignment, receipt keys for import checks. */
import "server-only";

import { writeAuditLog } from "@/lib/db/audit-log";
import { IMPORT_BATCH_SIZE, chunkArray } from "@/lib/extractor/batch";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { deleteContractsCascadeAdmin } from "./contract-cascade";
import { getConsultantInOffice } from "./consultants";
import { type AdminResult } from "./result";

export async function findContractsByNumbers(
  contractNumbers: string[],
  opts?: { officeId?: string; consultantId?: string },
): Promise<Array<{ id: string; contract_number: string }>> {
  if (contractNumbers.length === 0) return [];
  const unique = [...new Set(contractNumbers.map((n) => n.trim()).filter(Boolean))];
  const out: Array<{ id: string; contract_number: string }> = [];
  for (const chunk of chunkArray(unique, IMPORT_BATCH_SIZE)) {
    let query = supabaseAdmin
      .from("contract")
      .select("id, contract_number")
      .in("contract_number", chunk);
    if (opts?.officeId) query = query.eq("office_id", opts.officeId);
    if (opts?.consultantId) query = query.eq("consultant_id", opts.consultantId);
    const { data, error } = await query;
    if (error) throw error;
    out.push(...((data || []) as Array<{ id: string; contract_number: string }>));
  }
  return out;
}

export type ContractDetailKeyRow = {
  contract_id: string;
  receipt_number: string | null;
  payment_date: string | null;
  premium_payment: number | null;
};

/** Receipt identifiers of stored details, for the pre-import duplicate check. */
export async function listDetailKeysForContractsAdmin(
  contractIds: string[],
): Promise<ContractDetailKeyRow[]> {
  const out: ContractDetailKeyRow[] = [];
  for (const chunk of chunkArray(contractIds, IMPORT_BATCH_SIZE)) {
    const { data, error } = await supabaseAdmin
      .from("contract_detail")
      .select("contract_id, receipt_number, payment_date, premium_payment")
      .in("contract_id", chunk);
    if (error) throw error;
    out.push(...((data || []) as ContractDetailKeyRow[]));
  }
  return out;
}

export async function reassignContractAdmin(input: {
  officeId: string;
  contractId: string;
  toConsultantId: string;
  actorUserId: string;
  notes?: string | null;
}): Promise<
  AdminResult<{
    contract: {
      id: string;
      consultant_id: string;
      office_id: string;
      contract_number: string | null;
    };
    fromConsultantId: string;
    toConsultantId: string;
    toConsultantName: string | null;
  }>
> {
  const { data: contract, error: contractError } = await supabaseAdmin
    .from("contract")
    .select("id, office_id, consultant_id, contract_number, client_id")
    .eq("id", input.contractId)
    .eq("office_id", input.officeId)
    .maybeSingle();
  if (contractError) throw contractError;
  if (!contract) {
    return { ok: false, code: "not_found", error: "Póliza no encontrada." };
  }

  if (contract.consultant_id === input.toConsultantId) {
    return {
      ok: false,
      code: "invalid",
      error: "La póliza ya pertenece a ese asesor.",
    };
  }

  const toConsultant = await getConsultantInOffice(
    input.toConsultantId,
    input.officeId,
  );
  if (!toConsultant) {
    return {
      ok: false,
      code: "not_found",
      error: "Asesor destino no encontrado en esta promotoría.",
    };
  }
  if (toConsultant.status === "INACTIVE") {
    return {
      ok: false,
      code: "invalid",
      error: "No puedes reasignar a un asesor inactivo.",
    };
  }

  const fromConsultantId = contract.consultant_id as string;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("contract")
    .update({
      consultant_id: input.toConsultantId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.contractId)
    .eq("office_id", input.officeId)
    .select("id, consultant_id, office_id, contract_number")
    .single();
  if (updateError) throw updateError;

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: "office",
    action: "contract.reassign",
    entityType: "contract",
    entityId: input.contractId,
    source: "api",
    oldValues: { consultant_id: fromConsultantId },
    newValues: {
      consultant_id: input.toConsultantId,
      notes: input.notes?.trim() || null,
      contract_number: (contract.contract_number as string | null) ?? null,
    },
  });

  return {
    ok: true,
    data: {
      contract: updated as {
        id: string;
        consultant_id: string;
        office_id: string;
        contract_number: string | null;
      },
      fromConsultantId,
      toConsultantId: input.toConsultantId,
      toConsultantName: toConsultant.name,
    },
  };
}

/** Delete one póliza after checking it belongs to the caller (office, and asesor when given). */
export async function deleteContractAdmin(input: {
  contractId: string;
  officeId: string;
  /** Asesor callers may delete only their own pólizas */
  consultantId?: string;
  actorUserId: string;
  actorRole: "promotory" | "consultant";
}): Promise<AdminResult<{ contractNumber: string | null }>> {
  const { data: contract, error } = await supabaseAdmin
    .from("contract")
    .select("id, office_id, consultant_id, client_id, contract_number, issue_date, payment_method, status")
    .eq("id", input.contractId)
    .maybeSingle();
  if (error) throw error;
  if (
    !contract ||
    contract.office_id !== input.officeId ||
    (input.consultantId && contract.consultant_id !== input.consultantId)
  ) {
    return { ok: false, code: "not_found", error: "No encontramos la póliza." };
  }

  await deleteContractsCascadeAdmin([contract.id]);

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole,
    action: "contract.delete",
    entityType: "contract",
    entityId: contract.id,
    source: "ui",
    oldValues: {
      contract_number: contract.contract_number,
      consultant_id: contract.consultant_id,
      client_id: contract.client_id,
      issue_date: contract.issue_date,
      payment_method: contract.payment_method,
      status: contract.status,
    },
  });

  return { ok: true, data: { contractNumber: contract.contract_number } };
}

/** Move a póliza to another client of the office (duplicate clients), with `contract.reassign_client` audit. */
export async function reassignContractClientAdmin(input: {
  officeId: string;
  contractId: string;
  toClientId: string;
  actorUserId: string;
  notes?: string | null;
}): Promise<AdminResult<{ toClientName: string; fromClientRemaining: number; fromClientId: string | null }>> {
  const { data: contract, error: contractError } = await supabaseAdmin
    .from("contract")
    .select("id, office_id, client_id, contract_number")
    .eq("id", input.contractId)
    .eq("office_id", input.officeId)
    .maybeSingle();
  if (contractError) throw contractError;
  if (!contract) return { ok: false, code: "not_found", error: "Póliza no encontrada." };
  if (contract.client_id === input.toClientId) {
    return { ok: false, code: "invalid", error: "La póliza ya pertenece a ese cliente." };
  }

  const { data: toClient, error: clientError } = await supabaseAdmin
    .from("client")
    .select("id, office_id, name")
    .eq("id", input.toClientId)
    .maybeSingle();
  if (clientError) throw clientError;
  let linked = toClient?.office_id === input.officeId;
  if (toClient && !linked) {
    const { count } = await supabaseAdmin
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("client_id", toClient.id)
      .eq("office_id", input.officeId);
    linked = (count ?? 0) > 0;
  }
  if (!toClient || !linked) {
    return { ok: false, code: "not_found", error: "Cliente destino no encontrado en esta promotoría." };
  }

  const { error: updateError } = await supabaseAdmin
    .from("contract")
    .update({ client_id: input.toClientId, updated_at: new Date().toISOString() })
    .eq("id", input.contractId)
    .eq("office_id", input.officeId);
  if (updateError) throw updateError;

  let fromClientRemaining = 0;
  if (contract.client_id) {
    const { count } = await supabaseAdmin
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("client_id", contract.client_id);
    fromClientRemaining = count ?? 0;
  }

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: "office",
    action: "contract.reassign_client",
    entityType: "contract",
    entityId: input.contractId,
    source: "api",
    oldValues: { client_id: contract.client_id },
    newValues: {
      client_id: input.toClientId,
      client_name: toClient.name,
      notes: input.notes?.trim() || null,
      contract_number: contract.contract_number,
    },
  });

  return {
    ok: true,
    data: { toClientName: toClient.name as string, fromClientRemaining, fromClientId: contract.client_id },
  };
}
