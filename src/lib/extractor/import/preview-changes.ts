import "server-only";

/**
 * Commission re-import review: for pólizas already in LifeOps, what the file would change.
 * fills = empty in LifeOps (applied automatically) · diffs = different (only when picked).
 */
import { normalizeClientName } from "@/lib/clients/name-match";
import type { Db } from "@/lib/db";
import { DETAIL_VALUE_FIELDS, sameValue } from "@/lib/extractor/receipt";
import type { ContractDetail } from "@/lib/supabase";
import { cellAt, groupRowsByContract, resolveImportColumns, type IndexedRow } from "./columns";
import { detailValuesFromRow } from "./detail-record";
import { normalizePaymentMethod } from "./parse";
import type { CommissionChangeItem } from "./types";


const DETAIL_LABEL: Record<(typeof DETAIL_VALUE_FIELDS)[number], string> = {
  issue_date: "Emisión",
  payment_date: "Pago",
  premium_payment: "Prima pago",
  payment_method: "Forma de pago",
  commission_honoraries: "Comisión",
  commission_percentage: "% comisión",
  collection_premium: "Prima cobro",
  seniority: "Antigüedad",
  target_premium: "Prima meta",
  movement: "Movimiento",
  commission_premium: "Prima comisión",
};

const CURRENCY_LABEL: Record<string, string> = { PESO: "Pesos", DOLAR: "Dólares", UDI: "UDI" };

function show(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "number") return value.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [y, m, d] = text.split("-");
    return `${d}/${m}/${y}`;
  }
  return text;
}

const fold = (v: string) => v.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

export async function previewCommissionChanges(
  db: Db,
  input: { officeId: string; headers: string[]; rows: IndexedRow[] },
): Promise<CommissionChangeItem[]> {
  const columns = resolveImportColumns(input.headers);
  const { groups } = groupRowsByContract(input.rows, columns);
  const numbers = [...new Set(groups.map((g) => g.contractNumber).filter(Boolean))];
  if (numbers.length === 0) return [];

  const existing = new Map(
    (await db.contract.findWithPartiesByNumbers(numbers, input.officeId)).map((c) => [c.contract_number ?? "", c]),
  );
  if (existing.size === 0) return [];
  const stored = new Map<string, ContractDetail[]>();
  for (const detail of await db.contractDetail.listByContracts([...existing.values()].map((c) => c.id))) {
    stored.set(detail.contract_id, [...(stored.get(detail.contract_id) ?? []), detail]);
  }

  const items = new Map<string, CommissionChangeItem>();
  for (const group of groups) {
    const contract = existing.get(group.contractNumber);
    if (!contract) continue;
    const item = items.get(group.contractNumber) ?? {
      contractNumber: group.contractNumber,
      clientName: contract.client?.name ?? group.clientName,
      fills: [],
      diffs: [],
    };
    items.set(group.contractNumber, item);
    const has = (field: string) => item.diffs.some((d) => d.field === field) || item.fills.some((d) => d.field === field);
    const push = (field: string, label: string, current: unknown, incoming: unknown) => {
      if (has(field)) return;
      const change = { field, label, current: show(current), incoming: show(incoming) };
      if (current == null || String(current).trim() === "") item.fills.push(change);
      else item.diffs.push(change);
    };

    const currentCode = contract.consultant?.consultant_code ?? "";
    if (group.consultantCode && fold(currentCode) !== fold(group.consultantCode)) {
      push("consultantCode", "Asesor (clave)", currentCode || contract.consultant?.name, group.consultantCode);
    }
    const currentClient = contract.client?.name ?? "";
    if (group.clientName && normalizeClientName(currentClient) !== normalizeClientName(group.clientName)) {
      push("clientName", "Contratante", currentClient, group.clientName);
    }
    const method = group.rows
      .map(({ row }) => normalizePaymentMethod(cellAt(row, columns.paymentMethod) || null))
      .find((m) => m && ["Anual", "Semestral", "Trimestral", "Mensual"].includes(m));
    if (method && fold(contract.payment_method ?? "") !== fold(method)) {
      push("paymentMethod", "Forma de pago", contract.payment_method, method);
    }
    if (group.currency && fold(contract.currency ?? "") !== fold(group.currency)) {
      push(
        "currency",
        "Moneda",
        contract.currency ? CURRENCY_LABEL[contract.currency] ?? contract.currency : null,
        CURRENCY_LABEL[group.currency] ?? group.currency,
      );
    }

    // Receipts already stored (same RECIBO) whose values differ
    const byReceipt = new Map(
      (stored.get(contract.id) ?? []).filter((d) => d.receipt_number).map((d) => [d.receipt_number as string, d]),
    );
    for (const { row } of group.rows) {
      const incoming = detailValuesFromRow(row, columns);
      const receipt = incoming.receipt_number;
      const current = receipt ? byReceipt.get(receipt) : undefined;
      if (!receipt || !current) continue;
      const changed = DETAIL_VALUE_FIELDS.filter((f) => !sameValue(current[f], incoming[f]));
      if (changed.length === 0 || has(`receipt:${receipt}`)) continue;
      item.diffs.push({
        field: `receipt:${receipt}`,
        label: `Recibo ${receipt}`,
        current: changed.map((f) => `${DETAIL_LABEL[f]} ${show(current[f])}`).join(" · "),
        incoming: changed.map((f) => `${DETAIL_LABEL[f]} ${show(incoming[f])}`).join(" · "),
      });
    }
  }

  return [...items.values()].filter((i) => i.fills.length > 0 || i.diffs.length > 0);
}
