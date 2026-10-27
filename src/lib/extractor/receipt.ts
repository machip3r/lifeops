import type { ContractDetail } from "@/lib/supabase";

/** Commission-file header that carries the insurer receipt number. */
export const RECEIPT_HEADER = "RECIBO";

const RECEIPT_NUMBER_PATTERN = /^[A-Z0-9][A-Z0-9\-/._]{0,63}$/;

/** Receipt number as stored in `contract_detail.receipt_number`, or null when absent or unusable. */
export function normalizeReceiptNumber(raw: string | null | undefined): string | null {
  const value = (raw ?? "").replace(/\s+/g, "").toUpperCase();
  return RECEIPT_NUMBER_PATTERN.test(value) ? value : null;
}

export const DETAIL_VALUE_FIELDS = [
  "issue_date",
  "payment_date",
  "premium_payment",
  "payment_method",
  "commission_honoraries",
  "commission_percentage",
  "collection_premium",
  "seniority",
  "target_premium",
  "movement",
  "commission_premium",
] as const;

type DetailValues = Pick<ContractDetail, (typeof DETAIL_VALUE_FIELDS)[number]> & {
  receipt_number?: string | null;
};

export function sameValue(a: unknown, b: unknown): boolean {
  const left = a === "" || a === undefined ? null : a;
  const right = b === "" || b === undefined ? null : b;
  if (left === null || right === null) return left === right;
  if (typeof left === "number" && typeof right === "number") {
    return Math.abs(left - right) < 0.01;
  }
  return left === right;
}

function sameDetailValues(a: DetailValues, b: DetailValues): boolean {
  return DETAIL_VALUE_FIELDS.every((field) => sameValue(a[field], b[field]));
}

/** Keeps one row per receipt number; a later row in the file replaces an earlier one. */
export function collapseRepeatedReceipts<T extends DetailValues>(
  details: T[],
): { records: T[]; repeated: string[] } {
  const byReceipt = new Map<string, number>();
  const records: T[] = [];
  const repeated = new Set<string>();
  for (const detail of details) {
    const receipt = detail.receipt_number;
    if (!receipt) {
      records.push(detail);
      continue;
    }
    const at = byReceipt.get(receipt);
    if (at === undefined) {
      byReceipt.set(receipt, records.length);
      records.push(detail);
    } else {
      records[at] = detail;
      repeated.add(receipt);
    }
  }
  return { records, repeated: [...repeated] };
}

/**
 * Decides how imported rows land on a póliza's stored details:
 * - same receipt number → update that row (or leave it when nothing changed)
 * - stored row without receipt and identical values → adopt it (fills `receipt_number`)
 * - row without receipt identical to a stored one → skip as duplicate
 * - anything else → insert
 * `allowUpdate(receipt)` false keeps a stored receipt whose values differ (the user chose LifeOps).
 */
export function planDetailWrites<T extends DetailValues>(
  existing: Array<DetailValues & { id: string }>,
  incoming: T[],
  allowUpdate: (receipt: string) => boolean = () => true,
): {
  inserts: T[];
  updates: Array<{ id: string; record: T }>;
  unchanged: number;
  skipped: number;
  /** Stored receipts with different values left as they were */
  kept: number;
} {
  const byReceipt = new Map(
    existing
      .filter((row) => row.receipt_number)
      .map((row) => [row.receipt_number as string, row]),
  );
  const claimed = new Set<string>();
  const claimMatch = (record: T, onlyWithoutReceipt: boolean) => {
    const match = existing.find(
      (row) =>
        !claimed.has(row.id) &&
        (!onlyWithoutReceipt || !row.receipt_number) &&
        sameDetailValues(row, record),
    );
    if (match) claimed.add(match.id);
    return match;
  };

  const inserts: T[] = [];
  const updates: Array<{ id: string; record: T }> = [];
  let unchanged = 0;
  let skipped = 0;
  let kept = 0;

  for (const record of incoming) {
    const receipt = record.receipt_number;
    if (!receipt) {
      if (claimMatch(record, false)) skipped++;
      else inserts.push(record);
      continue;
    }

    const stored = byReceipt.get(receipt);
    if (stored) {
      claimed.add(stored.id);
      if (sameDetailValues(stored, record)) unchanged++;
      else if (allowUpdate(receipt)) updates.push({ id: stored.id, record });
      else kept++;
      continue;
    }

    const legacy = claimMatch(record, true);
    if (legacy) updates.push({ id: legacy.id, record });
    else inserts.push(record);
  }

  return { inserts, updates, unchanged, skipped, kept };
}
