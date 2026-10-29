/**
 * Server side of the registry import (Mina de Oro / plantilla). Compares rows with LifeOps and
 * applies: new pólizas are created; empty LifeOps fields are filled; differing fields change only
 * when the user picked them in the review (default: keep LifeOps).
 */
import type { Db } from "@/lib/db";
import type { AuditActor } from "@/lib/db/audit-log";
import { initialCollectionStatus, nextCollectionDue } from "@/lib/collections/next-due";
import { isInForce } from "@/lib/contracts/policy-status";
import { normalizeClientName } from "@/lib/clients/name-match";
import type { Client, Consultant, Contract } from "@/lib/supabase";
import { IMPORT_BATCH_SIZE, chunkArray } from "@/lib/extractor/batch";
import {
  REGISTRY_FIELDS,
  displayRegistryValue,
  sameRegistryValue,
  type RegistryField,
  type RegistryRow,
  type RegistrySource,
} from "./fields";

type ExistingContract = Contract & {
  client: Client | null;
  consultant: Pick<Consultant, "id" | "consultant_code" | "name"> | null;
};

type RegistryChange = {
  field: RegistryField;
  label: string;
  current: string;
  incoming: string;
};

export type RegistryPreviewItem = {
  index: number;
  contractNumber: string;
  clientName: string;
  consultantCode: string;
  /** new: not in LifeOps · changed: has differences · filled: only empty fields to complete · same */
  kind: "new" | "changed" | "filled" | "same";
  /** En vigor in the file and LifeOps has no newer insurer date: its receipts up to `asOf` count as paid */
  confirmsInForce: boolean;
  fills: RegistryChange[];
  diffs: RegistryChange[];
};

export type RegistryPreview = {
  items: RegistryPreviewItem[];
  /** Claves in the file without an asesor in the office (created as «Sin invitar» on import) */
  missingConsultants: Array<{ code: string; name: string | null }>;
};

export type RegistryApplyResult = {
  created: number;
  updated: number;
  unchanged: number;
  /** Existing pólizas en vigor whose insurer date moved to `asOf` */
  confirmed: number;
  errors: Array<{ row: number; error: string }>;
  warnings: Array<{ row: number; message: string }>;
};

const column = (row: object | null, name: string): unknown =>
  row ? (row as unknown as Record<string, unknown>)[name] : null;

function currentValue(field: RegistryField, existing: ExistingContract): unknown {
  const meta = REGISTRY_FIELDS[field] as { target: string; column?: string };
  if (field === "consultantCode") return existing.consultant?.consultant_code ?? null;
  if (field === "clientName") return existing.client?.name ?? null;
  if (meta.target === "client") return column(existing.client, meta.column!);
  return column(existing, meta.column!);
}

/** Changes a file row would bring to an existing póliza (fills = LifeOps empty, diffs = different). */
function compareRow(row: RegistryRow, existing: ExistingContract) {
  const fills: RegistryChange[] = [];
  const diffs: RegistryChange[] = [];
  for (const field of Object.keys(REGISTRY_FIELDS) as RegistryField[]) {
    const incoming = row[field];
    if (incoming == null || incoming === "") continue; // the file has nothing for this field
    const current = currentValue(field, existing);
    if (sameRegistryValue(field, current, incoming)) continue;
    const change: RegistryChange = {
      field,
      label: REGISTRY_FIELDS[field].label,
      current: displayRegistryValue(field, current),
      incoming: displayRegistryValue(field, incoming),
    };
    const isEmpty = current == null || String(current).trim() === "";
    // Asesor / contratante always exist on a póliza: a different one is a decision, never a fill
    if (isEmpty && REGISTRY_FIELDS[field].target !== "link") fills.push(change);
    else diffs.push(change);
  }
  return { fills, diffs };
}

/** Last row wins when a póliza number repeats in the file. */
function dedupe(rows: RegistryRow[], warnings: RegistryApplyResult["warnings"]) {
  const byNumber = new Map<string, RegistryRow>();
  for (const row of rows) {
    if (byNumber.has(row.contractNumber)) {
      warnings.push({ row: row.index, message: `La póliza ${row.contractNumber} aparece más de una vez; se usó la última fila.` });
    }
    byNumber.set(row.contractNumber, row);
  }
  return [...byNumber.values()];
}

/** Póliza en vigor after the import and the file date is newer than what LifeOps has. */
function confirmsInForce(row: RegistryRow, found: ExistingContract, asOf: string | null, picked: RegistryField[] = []): boolean {
  if (!asOf || !isInForce(row.status)) return false;
  const statusAfter = picked.includes("status") || found.status == null ? row.status : found.status;
  return isInForce(statusAfter) && (!found.in_force_as_of || found.in_force_as_of < asOf);
}

export async function previewRegistry(
  db: Db,
  input: { officeId: string; rows: RegistryRow[]; asOf: string | null },
): Promise<RegistryPreview> {
  const rows = dedupe(input.rows, []);
  const existing = new Map(
    (await db.contract.findWithPartiesByNumbers(rows.map((r) => r.contractNumber), input.officeId)).map((c) => [
      c.contract_number ?? "",
      c,
    ]),
  );
  const consultants = await db.consultant.getConsultantsByOffice(input.officeId);
  const knownCodes = new Set(consultants.map((c) => (c.consultant_code ?? "").trim().toLowerCase()).filter(Boolean));

  const missing = new Map<string, { code: string; name: string | null }>();
  const items: RegistryPreviewItem[] = rows.map((row) => {
    const key = row.consultantCode.trim().toLowerCase();
    if (!knownCodes.has(key) && !missing.has(key)) missing.set(key, { code: row.consultantCode, name: row.consultantName });
    const found = existing.get(row.contractNumber);
    const base = { index: row.index, contractNumber: row.contractNumber, clientName: row.clientName, consultantCode: row.consultantCode };
    if (!found) return { ...base, kind: "new", fills: [], diffs: [], confirmsInForce: false };
    const { fills, diffs } = compareRow(row, found);
    return {
      ...base,
      kind: diffs.length > 0 ? "changed" : fills.length > 0 ? "filled" : "same",
      fills,
      diffs,
      // Status picked in the review is unknown here: count it when LifeOps already has it en vigor
      confirmsInForce: confirmsInForce(row, found, input.asOf),
    };
  });
  return { items, missingConsultants: [...missing.values()] };
}

const contractValue = (field: RegistryField, row: RegistryRow): unknown => {
  const value = row[field];
  // Text columns keep the amount as written (no thousands separators)
  if (field === "annualPremium" || field === "insuredAmount") return value == null ? null : String(value);
  return value;
};

export async function applyRegistry(
  db: Db,
  input: {
    officeId: string;
    actor: AuditActor;
    source: RegistrySource;
    rows: RegistryRow[];
    /** Per póliza number: differing fields to overwrite with the file */
    updates: Record<string, RegistryField[]>;
    /** Insurer «en vigor» date of the file (Mina de Oro cut-off / import day) */
    asOf: string | null;
  },
): Promise<RegistryApplyResult> {
  const result: RegistryApplyResult = { created: 0, updated: 0, unchanged: 0, confirmed: 0, errors: [], warnings: [] };
  const confirmIds: string[] = [];
  const rows = dedupe(input.rows, result.warnings);

  const consultants = await db.consultant.getConsultantsByOffice(input.officeId);
  const consultantByCode = new Map(consultants.map((c) => [(c.consultant_code ?? "").trim().toLowerCase(), c]));
  const existing = new Map(
    (await db.contract.findWithPartiesByNumbers(rows.map((r) => r.contractNumber), input.officeId)).map((c) => [
      c.contract_number ?? "",
      c,
    ]),
  );

  // Clients by contratante name (found or created in the office)
  const relinkNames = rows
    .filter((r) => existing.has(r.contractNumber) && (input.updates[r.contractNumber] ?? []).includes("clientName"))
    .map((r) => r.clientName);
  const newRows = rows.filter((r) => !existing.has(r.contractNumber));
  const clientByName = await db.client.findOrCreateClientsByName(
    [...newRows.map((r) => r.clientName), ...relinkNames],
    input.officeId,
  );
  const clientFor = (name: string) => clientByName.get(normalizeClientName(name).toLowerCase()) ?? null;

  // Client contact: fill empty values; overwrite only when picked (one update per client)
  const clientPatches = new Map<string, { client: Client; patch: Partial<Client> }>();
  const queueClient = (client: Client | null, row: RegistryRow, overwrite: RegistryField[]) => {
    if (!client) return;
    const entry = clientPatches.get(client.id) ?? { client, patch: {} };
    for (const field of Object.keys(REGISTRY_FIELDS) as RegistryField[]) {
      const meta = REGISTRY_FIELDS[field] as { target: string; column?: string };
      if (meta.target !== "client" || row[field] == null || row[field] === "") continue;
      const current = column(client, meta.column!);
      const isEmpty = current == null || String(current).trim() === "";
      if ((isEmpty || overwrite.includes(field)) && !sameRegistryValue(field, current, row[field])) {
        (entry.patch as Record<string, unknown>)[meta.column!] = row[field];
      }
    }
    if (Object.keys(entry.patch).length > 0) clientPatches.set(client.id, entry);
  };

  // New pólizas
  const payloads: Array<{ row: RegistryRow; payload: Omit<Contract, "id" | "created_at" | "updated_at"> }> = [];
  for (const row of newRows) {
    const consultant = consultantByCode.get(row.consultantCode.trim().toLowerCase());
    const client = clientFor(row.clientName);
    if (!consultant || !client) {
      result.errors.push({
        row: row.index,
        error: !consultant ? `No se encontró al asesor con clave ${row.consultantCode}.` : `No se pudo registrar al cliente ${row.clientName}.`,
      });
      continue;
    }
    if (!row.issueDate) {
      result.errors.push({ row: row.index, error: `La póliza ${row.contractNumber} es nueva: falta su fecha de emisión.` });
      continue;
    }
    queueClient(client, row, []);
    payloads.push({
      row,
      payload: {
        office_id: input.officeId,
        consultant_id: consultant.id,
        client_id: client.id,
        contract_number: row.contractNumber,
        issue_date: row.issueDate,
        payment_method: row.paymentMethod,
        payment_channel: row.paymentChannel,
        project_name: row.projectName,
        line_code: row.lineCode,
        plan_classification: row.planClassification,
        insured_name: row.insuredName,
        status: row.status,
        currency: row.currency,
        annual_premium: row.annualPremium,
        insured_amount: row.insuredAmount,
        annual_premium_mxn: row.annualPremiumMxn,
        insured_amount_mxn: row.insuredAmountMxn,
        deductible_mxn: row.deductibleMxn,
        end_date: row.endDate,
        collection_day: row.collectionDay,
        in_force_as_of: isInForce(row.status) ? input.asOf : null,
        source: "import",
        collection_status:
          isInForce(row.status)
            ? initialCollectionStatus(
                nextCollectionDue({ issueDate: row.issueDate, paymentMethod: row.paymentMethod, inForceAsOf: input.asOf }),
              )
            : null,
      },
    });
  }
  for (const chunk of chunkArray(payloads, IMPORT_BATCH_SIZE)) {
    try {
      result.created += (await db.contract.createContracts(chunk.map((p) => p.payload))).length;
    } catch {
      // One bad row (e.g. a número taken meanwhile) should not sink the rest
      for (const { row, payload } of chunk) {
        try {
          result.created += (await db.contract.createContracts([payload])).length;
        } catch (error) {
          console.error("registry create failed", error);
          result.errors.push({ row: row.index, error: `No se pudo crear la póliza ${row.contractNumber}.` });
        }
      }
    }
  }

  // Existing pólizas: fills + picked differences
  for (const row of rows) {
    const found = existing.get(row.contractNumber);
    if (!found) continue;
    const picked = input.updates[row.contractNumber] ?? [];
    const { fills, diffs } = compareRow(row, found);
    const apply = new Set<RegistryField>([...fills.map((c) => c.field), ...diffs.filter((c) => picked.includes(c.field)).map((c) => c.field)]);

    const patch: Partial<Contract> = {};
    for (const field of apply) {
      const meta = REGISTRY_FIELDS[field] as { target: string; column?: string };
      if (meta.target === "contract") (patch as Record<string, unknown>)[meta.column!] = contractValue(field, row);
    }
    if (apply.has("consultantCode")) {
      const consultant = consultantByCode.get(row.consultantCode.trim().toLowerCase());
      if (consultant) patch.consultant_id = consultant.id;
    }
    let targetClient = found.client;
    if (apply.has("clientName")) {
      const client = clientFor(row.clientName);
      if (client) {
        patch.client_id = client.id;
        targetClient = client;
      }
    }
    if (found.source === "manual" && Object.keys(patch).length > 0) patch.source = "mixed";
    queueClient(targetClient, row, picked);
    if (confirmsInForce(row, found, input.asOf, picked)) confirmIds.push(found.id);

    if (Object.keys(patch).length === 0) {
      result.unchanged += 1;
      continue;
    }
    const saved = await db.contract.updateWithAudit(found.id, patch, input.actor, "import");
    if (saved.ok) result.updated += 1;
    else result.errors.push({ row: row.index, error: `${row.contractNumber}: ${saved.error}` });
  }

  if (input.asOf && confirmIds.length > 0) {
    try {
      result.confirmed = await db.contract.confirmInForce(confirmIds, input.asOf);
    } catch (error) {
      console.error("registry confirm in force failed", error);
      result.warnings.push({ row: 0, message: "No se pudo marcar la fecha en vigor de la aseguradora en algunas pólizas." });
    }
  }

  for (const { client, patch } of clientPatches.values()) {
    const saved = await db.client.updateWithAudit(client.id, patch, input.actor, "import");
    if (!saved.ok) result.warnings.push({ row: 0, message: `Cliente ${client.name}: ${saved.error}` });
  }

  await db.auditLog.write({
    officeId: input.officeId,
    actorUserId: input.actor.userId,
    actorRole: input.actor.role,
    action: "import.registry",
    entityType: "office",
    entityId: null,
    source: "import",
    newValues: {
      file_kind: input.source,
      rows: rows.length,
      created: result.created,
      updated: result.updated,
      unchanged: result.unchanged,
      confirmed_in_force: result.confirmed,
      in_force_as_of: input.asOf,
      errors: result.errors.length,
    },
  });

  return result;
}
