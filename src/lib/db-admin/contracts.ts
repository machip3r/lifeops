/** Pólizas: lookup by number, reassignment, receipt keys for import checks. */
import "server-only";

import { writeAuditLog } from "@/lib/db/audit-log";
import { IMPORT_BATCH_SIZE, chunkArray } from "@/lib/extractor/batch";
import { supabaseAdmin } from "@/lib/supabase/admin";
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
