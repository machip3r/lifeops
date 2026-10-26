/** Column mapping, grouping and batch planning shared by the browser and the server import. */
import { normalizeClientName } from "@/lib/clients/name-match";
import { currencyToStore } from "@/lib/contracts/currencies";
import { RECEIPT_HEADER } from "@/lib/extractor/receipt";
import { normalizeHeader } from "./parse";

/** A preview-table row with its 0-based position (errors report `index + 1`). */
export type IndexedRow = { index: number; cells: string[] };

export type ImportRowError = { row: number; error: string };

/** Pólizas per server batch — keeps each request a few seconds long. */
const IMPORT_CONTRACTS_PER_BATCH = 50;
/** Row cap per batch so the request body stays well under the Server Action limit. */
const IMPORT_ROWS_PER_BATCH = 800;

export function resolveImportColumns(headers: string[]) {
  const headerIndex = new Map(headers.map((h, idx) => [normalizeHeader(h), idx]));
  const getIndex = (candidates: string[], fallback: number): number => {
    for (const name of candidates) {
      const idx = headerIndex.get(normalizeHeader(name));
      if (idx !== undefined) return idx;
    }
    return fallback;
  };

  return {
    clientName: getIndex(["CLIENTE"], 0),
    contractNumber: getIndex(["POLIZA"], 1),
    currency: getIndex(["MONEDA"], 3),
    exchangeRate: getIndex(["TIPO CAMBIO"], 4),
    consultantCode: getIndex(["ASESOR"], 5),
    issueDate: getIndex(["FECHA EMISION"], 8),
    paymentDate: getIndex(["FECHA PAGO"], 11),
    premiumPayment: getIndex(["PRIMA PAGO", "PRIMA PAGO 1"], 12),
    paymentMethod: getIndex(["FORMA DE PAGO"], 14),
    commissionHonoraries: getIndex(["COMISION/HONORARIOS", "COMISION HONORARIOS"], 15),
    commissionPercentage: getIndex(["% COMISION", "PORCENTAJE COMISION"], 16),
    movement: getIndex(["MOVIMIENTO"], 18),
    collectionPremium: getIndex(["PRIMA COBRO"], 19),
    seniority: getIndex(["ANTIGÜEDAD", "ANTIGUEDAD"], 20),
    targetPremium: getIndex(["PRIMA META"], 21),
    commissionPremium: getIndex(["PRIMA COMISION"], 13),
    // No positional fallback: a wrong column would merge different receipts
    receiptNumber: getIndex([RECEIPT_HEADER], -1),
  };
}

export type ImportColumns = ReturnType<typeof resolveImportColumns>;

export function cellAt(row: string[], index: number): string {
  if (index < 0 || index >= row.length) return "";
  return row[index]?.trim() || "";
}

/** Póliza number as used for lookups and the prior-payment map. */
export function normalizeContractNumber(raw: string): string {
  return raw.trim().replace(/,/g, "").replace(/\s+/g, "");
}

export type ContractGroup = {
  clientName: string;
  contractNumber: string;
  currency: string;
  exchangeRate: string;
  consultantCode: string;
  rows: Array<{ rowIndex: number; row: string[] }>;
};

/** Groups rows by Cliente + Poliza + Asesor; rows without Cliente or Asesor become errors. */
export function groupRowsByContract(
  rows: IndexedRow[],
  columns: ImportColumns,
): { groups: ContractGroup[]; errors: ImportRowError[] } {
  const groups = new Map<string, ContractGroup>();
  const errors: ImportRowError[] = [];

  for (const { index, cells } of rows) {
    const clientName = normalizeClientName(cellAt(cells, columns.clientName));
    const contractNumber = cellAt(cells, columns.contractNumber);
    const consultantCode = cellAt(cells, columns.consultantCode);
    if (!clientName || !consultantCode) {
      errors.push({ row: index + 1, error: "Falta el cliente o la clave del asesor en esta fila." });
      continue;
    }

    const key = `${clientName}|${contractNumber}|${consultantCode}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        clientName,
        contractNumber,
        currency: currencyToStore(cellAt(cells, columns.currency)) ?? "",
        exchangeRate: cellAt(cells, columns.exchangeRate),
        consultantCode,
        rows: [],
      };
      groups.set(key, group);
    }
    group.rows.push({ rowIndex: index + 1, row: cells });
  }

  return { groups: [...groups.values()], errors };
}

/**
 * Splits the preview table into server batches. All rows of one póliza number stay in the
 * same batch, so a póliza is created once and its receipts are compared together.
 */
export function planImportBatches(
  rows: string[][],
  headers: string[],
  limits: { contracts: number; rows: number } = {
    contracts: IMPORT_CONTRACTS_PER_BATCH,
    rows: IMPORT_ROWS_PER_BATCH,
  },
): { batches: IndexedRow[][]; contractCount: number } {
  const columns = resolveImportColumns(headers);
  const buckets = new Map<string, IndexedRow[]>();
  rows.forEach((cells, index) => {
    const number = normalizeContractNumber(cellAt(cells, columns.contractNumber));
    const key = number
      ? `n:${number}`
      : `c:${normalizeClientName(cellAt(cells, columns.clientName))}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push({ index, cells });
    else buckets.set(key, [{ index, cells }]);
  });

  const batches: IndexedRow[][] = [];
  let current: IndexedRow[] = [];
  let currentContracts = 0;
  for (const bucket of buckets.values()) {
    const full =
      currentContracts >= limits.contracts ||
      (current.length > 0 && current.length + bucket.length > limits.rows);
    if (full) {
      batches.push(current);
      current = [];
      currentContracts = 0;
    }
    current.push(...bucket);
    currentContracts += 1;
  }
  if (current.length > 0) batches.push(current);

  return { batches, contractCount: buckets.size };
}
