import "server-only";

import { normalizeClientName } from "@/lib/clients/name-match";
import { initialCollectionStatus, nextCollectionDue } from "@/lib/collections/next-due";
import type { Db } from "@/lib/db";
import type { AuditActor } from "@/lib/db/audit-log";
import type { ImportedDetail } from "@/lib/db/contract-detail";
import { detailValuesFromRow } from "./detail-record";
import { chunkArray, IMPORT_BATCH_SIZE } from "@/lib/extractor/batch";
import {
  cellAt,
  groupRowsByContract,
  resolveImportColumns,
  type ContractGroup,
  type IndexedRow,
} from "@/lib/extractor/import/columns";
import {
  normalizePaymentMethod,
  parseDate,
  parseNumeric,
} from "@/lib/extractor/import/parse";
import { collapseRepeatedReceipts } from "@/lib/extractor/receipt";
import type { Client, Consultant, Contract } from "@/lib/supabase";
import type {
  CommissionImportBatchResult,
  CommissionImportCounts,
  CommissionImportMeta,
} from "./types";

/**
 * Commission import, server side. The browser splits the preview table into batches
 * (`planImportBatches`) and calls start → batch (n times) → finish, so no single request
 * runs long. Every query goes through `db`, bound to the caller's JWT (RLS applies).
 */

type ImportScope = {
  db: Db;
  /** Auth user running the import (audit + `commission_import.uploaded_by`). */
  actorUserId: string;
  officeId: string;
};

function todayIso(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
}

/** File date required and not future. */
function validateImportMeta(meta: CommissionImportMeta): string | null {
  const today = todayIso();
  const fileIssueDate = meta.fileIssueDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fileIssueDate)) {
    return "Indica la fecha de emisión del archivo de comisiones (AAAA-MM-DD).";
  }
  if (fileIssueDate > today) {
    return "La fecha de emisión del archivo no puede ser futura.";
  }
  return null;
}

/** Validates dates and opens the `commission_import` record (asesores can't create it; import continues). */
export async function startCommissionImport(
  input: ImportScope & { rowCount: number; importMeta: CommissionImportMeta },
): Promise<{ commissionImportId: string | null; error?: string; warnings: string[] }> {
  const invalid = validateImportMeta(input.importMeta);
  if (invalid) return { commissionImportId: null, error: invalid, warnings: [] };

  try {
    const batch = await input.db.commissionImport.create({
      office_id: input.officeId,
      uploaded_by: input.actorUserId,
      file_name: input.importMeta.fileName ?? null,
      issue_date: input.importMeta.fileIssueDate.trim(),
      prior_payment_date: null,
      status: "pending",
      row_count: input.rowCount,
      metadata: {
      },
    });
    return { commissionImportId: batch.id, warnings: [] };
  } catch (error) {
    console.error("commission_import create failed", error);
    return {
      commissionImportId: null,
      warnings: ["No se pudo guardar el lote de importación; se continúa sin trazabilidad de batch."],
    };
  }
}

type ResolvedGroup = {
  group: ContractGroup;
  consultant: Consultant;
  client: Client;
  issueDate: string | null;
  contract?: Contract;
};

/** Imports one batch of rows (whole pólizas) and returns its share of the result. */
export async function importCommissionBatch(
  input: ImportScope & {
    /** Asesor session: only rows with this consultant's code are imported. */
    consultantId?: string;
    commissionImportId: string | null;
    headers: string[];
    rows: IndexedRow[];
    importMeta: CommissionImportMeta;
    /**
     * Review decisions per póliza number: contract fields (`consultantCode`, `clientName`,
     * `paymentMethod`, `currency`) and `receipt:<RECIBO>` to overwrite. Anything not listed keeps
     * LifeOps (empty LifeOps values are still filled).
     */
    decisions?: Record<string, string[]>;
  },
): Promise<CommissionImportBatchResult> {
  const { db, actorUserId, officeId, consultantId, commissionImportId } = input;
  const decisions = input.decisions ?? {};
  const picked = (contractNumber: string, field: string) => (decisions[contractNumber] ?? []).includes(field);
  const warnings: Array<{ row: number; message: string }> = [];
  const counts: CommissionImportCounts = {
    contractsCreated: 0,
    contractsUpdated: 0,
    detailsInserted: 0,
    detailsUpdated: 0,
    paymentsMarked: 0,
  };

  const invalid = validateImportMeta(input.importMeta);
  if (invalid) {
    return { success: 0, errors: [{ row: 0, error: invalid }], warnings, counts };
  }

  const columns = resolveImportColumns(input.headers);
  const { groups, errors } = groupRowsByContract(input.rows, columns);
  if (groups.length === 0) return { success: 0, errors, warnings, counts };

  // Asesores of this batch (asesor session: only their own code)
  const consultantByCode = new Map<string, Consultant>();
  if (consultantId) {
    const own = await db.consultant.getConsultantById(consultantId);
    const code = own?.consultant_code?.trim().toLowerCase();
    if (own && code) consultantByCode.set(code, own);
  } else {
    const codes = [...new Set(groups.map((g) => g.consultantCode.trim()))];
    for (const code of codes) {
      const consultant = await db.consultant.findConsultantByCode(code, officeId);
      if (consultant) consultantByCode.set(code.toLowerCase(), consultant);
    }
  }

  // Existing pólizas by number: the whole office (RLS), or the asesor's own pólizas.
  // A póliza with another asesor is found too, so the review can reassign it instead of failing.
  const existingByNumber = new Map<string, Contract>();
  const numbers = [...new Set(groups.map((g) => g.contractNumber).filter(Boolean))];
  for (const chunk of chunkArray(numbers, IMPORT_BATCH_SIZE)) {
    const found = await db.contract.findByNumbers(chunk, { consultantId });
    for (const contract of found) {
      if (contract.contract_number) existingByNumber.set(contract.contract_number, contract);
    }
  }

  let clientByName: Map<string, Client>;
  try {
    clientByName = await db.client.findOrCreateClientsByName(
      groups
        .filter((g) => !g.contractNumber || !existingByNumber.has(g.contractNumber) || picked(g.contractNumber, "clientName"))
        .map((g) => g.clientName),
      officeId,
    );
  } catch (error) {
    console.error("import clients failed", error);
    return {
      success: 0,
      errors: [...errors, ...groups.map((g) => ({
        row: g.rows[0]?.rowIndex ?? 0,
        error: "No se pudieron crear o buscar los clientes de esta póliza.",
      }))],
      warnings,
      counts,
    };
  }

  // Resolve asesor / cliente / póliza per group
  const resolved: ResolvedGroup[] = [];
  const toCreate = new Map<string, ResolvedGroup[]>(); // póliza number (or unnamed key) → groups
  for (const group of groups) {
    const groupRow = group.rows[0]?.rowIndex ?? 0;
    const consultant = consultantByCode.get(group.consultantCode.trim().toLowerCase());
    const existingContract = group.contractNumber ? existingByNumber.get(group.contractNumber) : undefined;
    if (existingContract) {
      // Already in LifeOps: receipts go to it; asesor / cliente only change when picked
      let issueDate: string | null = null;
      for (const { row } of group.rows) {
        const iso = parseDate(cellAt(row, columns.issueDate));
        if (iso && (!issueDate || iso < issueDate)) issueDate = iso;
      }
      resolved.push({
        group,
        consultant: consultant ?? ({ id: existingContract.consultant_id } as Consultant),
        client:
          clientByName.get(normalizeClientName(group.clientName).toLowerCase()) ??
          ({ id: existingContract.client_id, name: group.clientName } as Client),
        issueDate,
        contract: existingContract,
      });
      continue;
    }
    if (!consultant?.id) {
      errors.push({
        row: groupRow,
        error: consultantId
          ? `El código de asesor "${group.consultantCode}" no coincide con tu cuenta.`
          : `No hay un asesor con código "${group.consultantCode}" en tu promotoría. Créalo antes de importar.`,
      });
      continue;
    }
    const client = clientByName.get(normalizeClientName(group.clientName).toLowerCase());
    if (!client) {
      errors.push({ row: groupRow, error: `Cliente "${group.clientName}" no encontrado.` });
      continue;
    }

    let issueDate: string | null = null;
    for (const { row } of group.rows) {
      const iso = parseDate(cellAt(row, columns.issueDate));
      if (iso && (!issueDate || iso < issueDate)) issueDate = iso;
    }

    const entry: ResolvedGroup = { group, consultant, client, issueDate };
    const existing = group.contractNumber ? existingByNumber.get(group.contractNumber) : undefined;
    if (existing) {
      entry.contract = existing;
      resolved.push(entry);
      continue;
    }

    // New pólizas need FECHA EMISION: it anchors their receipt calendar
    if (!issueDate) {
      errors.push({
        row: groupRow,
        error: group.contractNumber
          ? `Póliza "${group.contractNumber}" es nueva: indica su fecha de emisión.`
          : "Póliza nueva sin número: indica su fecha de emisión.",
      });
      continue;
    }
    resolved.push(entry);
    // Same number twice in the file (e.g. client spelled differently) → one póliza
    const createKey = group.contractNumber || `__unnamed__:${group.clientName}:${group.consultantCode}`;
    toCreate.set(createKey, [...(toCreate.get(createKey) ?? []), entry]);
  }

  await updateExistingContracts(db, resolved, warnings, counts, {
    columns,
    picked,
    actor: { userId: actorUserId, officeId, role: consultantId ? "consultant" : "promotory" },
  });
  await createNewContracts({ db, actorUserId, officeId, commissionImportId, columns, toCreate, errors, counts });

  // Receipts of every póliza in the batch, written together
  const ready = resolved.filter((entry) => entry.contract);
  const detailsByContract = new Map<string, ImportedDetail[]>();
  const groupsByContract = new Map<string, ResolvedGroup[]>();
  for (const entry of ready) {
    const contract = entry.contract as Contract;
    const records = entry.group.rows.map(({ row }) => ({
      contract_id: contract.id,
      commission_import_id: commissionImportId,
      ...detailValuesFromRow(row, columns),
    }));
    detailsByContract.set(contract.id, [...(detailsByContract.get(contract.id) ?? []), ...records]);
    groupsByContract.set(contract.id, [...(groupsByContract.get(contract.id) ?? []), entry]);
  }
  for (const [contractId, records] of detailsByContract) {
    const { records: collapsed, repeated } = collapseRepeatedReceipts(records);
    detailsByContract.set(contractId, collapsed);
    const first = groupsByContract.get(contractId)?.[0]?.group;
    for (const receipt of repeated) {
      warnings.push({
        row: first?.rows[0]?.rowIndex ?? 0,
        message: `El recibo ${receipt} de la póliza "${first?.contractNumber || "N/A"}" aparece más de una vez en el archivo; se usó la última fila.`,
      });
    }
  }

  const numberByContract = new Map(ready.map((e) => [(e.contract as Contract).id, e.group.contractNumber]));
  const written = await writeDetails(db, detailsByContract, groupsByContract, errors, (contractId, receipt) =>
    picked(numberByContract.get(contractId) ?? "", `receipt:${receipt}`),
  );
  const pendingCobranza: Array<{ contractId: string; details: ImportedDetail[] }> = [];
  let success = 0;
  for (const [contractId, result] of written) {
    const contractGroups = groupsByContract.get(contractId) ?? [];
    success += contractGroups.length;
    counts.detailsInserted += result.inserted.length;
    counts.detailsUpdated += result.updated.length;
    if (result.kept > 0) {
      const first = contractGroups[0]?.group;
      warnings.push({
        row: first?.rows[0]?.rowIndex ?? 0,
        message: `${result.kept} recibo(s) de la póliza "${first?.contractNumber || "N/A"}" traían otros valores; se conservaron los de LifeOps.`,
      });
    }
    if (result.skipped > 0) {
      const first = contractGroups[0]?.group;
      warnings.push({
        row: first?.rows[0]?.rowIndex ?? 0,
        message: `${result.skipped} detalle(s) sin recibo de la póliza "${first?.contractNumber || "N/A"}" ya estaban registrados; se omitieron.`,
      });
    }
    const touched = [...result.inserted, ...result.updated];
    if (touched.length > 0) pendingCobranza.push({ contractId, details: touched });
  }

  if (pendingCobranza.length > 0) {
    try {
      counts.paymentsMarked += await db.collections.syncPaymentsFromImportedDetails({
        officeId,
        actorUserId,
        items: pendingCobranza.map(({ contractId, details }) => ({
          contractId,
          details: details.map((d) => ({
            payment_date: d.payment_date ?? null,
            collection_premium: d.collection_premium ?? null,
          })),
        })),
      });
    } catch (error) {
      console.error("Cobranza import sync failed", error);
      warnings.push({ row: 0, message: "Detalles importados, pero no se pudo sincronizar cobranza en lote." });
    }
  }

  return { success, errors, warnings, counts };
}

/**
 * Existing pólizas: mark manual ones as mixed, fill empty data (emisión, forma de pago, moneda) and
 * apply the review picks (asesor, contratante, forma de pago, moneda). Audited as `contract.update`.
 */
async function updateExistingContracts(
  db: Db,
  resolved: ResolvedGroup[],
  warnings: Array<{ row: number; message: string }>,
  counts: CommissionImportCounts,
  opts: {
    columns: ReturnType<typeof resolveImportColumns>;
    picked: (contractNumber: string, field: string) => boolean;
    actor: AuditActor;
  },
) {
  const seen = new Set<string>();
  for (const entry of resolved) {
    const existing = entry.contract;
    if (!existing || seen.has(existing.id)) continue;
    seen.add(existing.id);
    counts.contractsUpdated += 1;
    const number = entry.group.contractNumber;
    warnings.push({
      row: entry.group.rows[0]?.rowIndex ?? 0,
      message: `La póliza "${number}" ya estaba en LifeOps: se agregaron sus recibos nuevos.`,
    });

    const isEmpty = (v: unknown) => v == null || String(v).trim() === "";
    const updates: Partial<Contract> = {};
    if (existing.source === "manual") updates.source = "mixed";
    if (!existing.issue_date && entry.issueDate) updates.issue_date = entry.issueDate;

    const method = entry.group.rows
      .map(({ row }) => normalizePaymentMethod(cellAt(row, opts.columns.paymentMethod) || null))
      .find((m) => m && ["Anual", "Semestral", "Trimestral", "Mensual"].includes(m));
    if (method && method !== existing.payment_method && (isEmpty(existing.payment_method) || opts.picked(number, "paymentMethod"))) {
      updates.payment_method = method;
    }
    const currency = entry.group.currency;
    if (currency && currency !== existing.currency && (isEmpty(existing.currency) || opts.picked(number, "currency"))) {
      updates.currency = currency;
    }
    if (opts.picked(number, "consultantCode") && entry.consultant.consultant_code && entry.consultant.id !== existing.consultant_id) {
      updates.consultant_id = entry.consultant.id;
    }
    if (opts.picked(number, "clientName") && entry.client.id && entry.client.id !== existing.client_id) {
      updates.client_id = entry.client.id;
    }

    if (Object.keys(updates).length > 0) {
      const saved = await db.contract.updateWithAudit(existing.id, updates, opts.actor, "import");
      if (!saved.ok) {
        warnings.push({ row: entry.group.rows[0]?.rowIndex ?? 0, message: `Póliza "${number}": ${saved.error}` });
        continue;
      }
      for (const other of resolved) {
        if (other.contract?.id === existing.id) other.contract = saved.data;
      }
    }
  }
}

/** First-time pólizas: one insert for the batch (receipt calendar starts at FECHA EMISION). */
async function createNewContracts(input: {
  db: Db;
  actorUserId: string;
  officeId: string;
  commissionImportId: string | null;
  columns: ReturnType<typeof resolveImportColumns>;
  toCreate: Map<string, ResolvedGroup[]>;
  errors: Array<{ row: number; error: string }>;
  counts: CommissionImportCounts;
}) {
  const { db, toCreate, errors, counts } = input;
  if (toCreate.size === 0) return;

  const pending = [...toCreate.values()];
  const payloads = pending.map((entries) => {
    const { group, consultant, client, issueDate } = entries[0];
    // FORMA DE PAGO from the first detail row when present
    const paymentMethod = normalizePaymentMethod(cellAt(group.rows[0]?.row ?? [], input.columns.paymentMethod) || null);
    let lastPaid: string | null = null;
    for (const entry of entries) {
      for (const { row } of entry.group.rows) {
        const paid = parseDate(cellAt(row, input.columns.paymentDate));
        if (paid && (!lastPaid || paid > lastPaid)) lastPaid = paid;
      }
    }
    return {
      consultant_id: consultant.id,
      client_id: client.id,
      contract_number: group.contractNumber || null,
      currency: group.currency || null,
      exchange_rate: parseNumeric(group.exchangeRate),
      payment_method: paymentMethod,
      status: "IN_FORCE" as const,
      source: "import" as const,
      office_id: input.officeId,
      issue_date: issueDate,
      collection_status: initialCollectionStatus(
        nextCollectionDue({ issueDate, lastPaidAt: lastPaid, paymentMethod }),
      ),
    };
  });

  const created: Array<{ entries: ResolvedGroup[]; contract: Contract }> = [];
  const withNumber = pending.filter((entries) => entries[0].group.contractNumber);
  try {
    const rows = await db.contract.createContracts(payloads.filter((p) => p.contract_number));
    const byNumber = new Map(rows.map((c) => [c.contract_number, c]));
    for (const entries of withNumber) {
      const contract = byNumber.get(entries[0].group.contractNumber);
      if (contract) created.push({ entries, contract });
    }
  } catch (error) {
    // One bad row fails the whole insert — retry one by one to isolate it
    console.error("bulk contract create failed", error);
    for (const entries of withNumber) {
      const payload = payloads[pending.indexOf(entries)];
      try {
        const [contract] = await db.contract.createContracts([payload]);
        if (contract) created.push({ entries, contract });
      } catch (rowError) {
        console.error("contract create failed", rowError);
        errors.push({
          row: entries[0].group.rows[0]?.rowIndex ?? 0,
          error: `No se pudo crear la póliza "${entries[0].group.contractNumber}".`,
        });
      }
    }
  }
  for (const entries of pending.filter((e) => !e[0].group.contractNumber)) {
    try {
      const [contract] = await db.contract.createContracts([payloads[pending.indexOf(entries)]]);
      if (contract) created.push({ entries, contract });
    } catch (error) {
      console.error("contract create failed", error);
      errors.push({
        row: entries[0].group.rows[0]?.rowIndex ?? 0,
        error: "No se pudo crear la póliza sin número.",
      });
    }
  }

  for (const { entries, contract } of created) {
    for (const entry of entries) entry.contract = contract;
  }
  counts.contractsCreated += created.length;
}

/** Writes all receipts of the batch at once; on failure, per póliza so one bad row is isolated. */
async function writeDetails(
  db: Db,
  detailsByContract: Map<string, ImportedDetail[]>,
  groupsByContract: Map<string, ResolvedGroup[]>,
  errors: Array<{ row: number; error: string }>,
  allowUpdate: (contractId: string, receipt: string) => boolean,
) {
  try {
    return await db.contractDetail.writeImportedDetails(detailsByContract, allowUpdate);
  } catch (error) {
    console.error("bulk detail write failed", error);
  }
  const results = new Map<string, { inserted: ImportedDetail[]; updated: ImportedDetail[]; skipped: number; kept: number }>();
  for (const [contractId, records] of detailsByContract) {
    try {
      const one = await db.contractDetail.writeImportedDetails(new Map([[contractId, records]]), allowUpdate);
      const result = one.get(contractId);
      if (result) results.set(contractId, result);
    } catch (error) {
      console.error("detail write failed", error);
      const first = groupsByContract.get(contractId)?.[0]?.group;
      errors.push({
        row: first?.rows[0]?.rowIndex ?? 0,
        error: `No se pudieron guardar los recibos de la póliza "${first?.contractNumber || "N/A"}".`,
      });
    }
  }
  return results;
}

/** Closes the `commission_import` record and writes one audit entry for the whole file. */
export async function finishCommissionImport(
  input: ImportScope & {
    commissionImportId: string | null;
    contractsProcessed: number;
    errorCount: number;
    counts: CommissionImportCounts;
  },
): Promise<void> {
  const { db, counts } = input;
  if (input.commissionImportId) {
    try {
      await db.commissionImport.update(input.commissionImportId, {
        status: input.errorCount > 0 && input.contractsProcessed === 0 ? "failed" : "imported",
        contracts_created: counts.contractsCreated,
        contracts_updated: counts.contractsUpdated,
        payments_marked: counts.paymentsMarked,
        error_message: input.errorCount > 0 ? `${input.errorCount} fila(s) con error` : null,
      });
    } catch (error) {
      console.error("commission_import update failed", error);
    }
  }

  if (input.contractsProcessed > 0 || counts.paymentsMarked > 0) {
    try {
      await db.collections.writeImportSyncAudit({
        officeId: input.officeId,
        actorUserId: input.actorUserId,
        contractsTouched: input.contractsProcessed,
        paymentsUpserted: counts.paymentsMarked,
        detailsInserted: counts.detailsInserted,
        detailsUpdated: counts.detailsUpdated,
      });
    } catch (error) {
      console.error("Cobranza import audit failed", error);
    }
  }
}
