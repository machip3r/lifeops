export type SortDir = "asc" | "desc";

export function compareNullableText(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const left = (a ?? "").trim().toLocaleLowerCase("es");
  const right = (b ?? "").trim().toLocaleLowerCase("es");
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, "es", { sensitivity: "base", numeric: true });
}

export function compareNullableNumber(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): number {
  const left =
    a === null || a === undefined || a === ""
      ? null
      : typeof a === "number"
        ? a
        : Number(String(a).replace(/,/g, ""));
  const right =
    b === null || b === undefined || b === ""
      ? null
      : typeof b === "number"
        ? b
        : Number(String(b).replace(/,/g, ""));
  if (left === null && right === null) return 0;
  if (left === null || Number.isNaN(left)) return 1;
  if (right === null || Number.isNaN(right)) return -1;
  return left === right ? 0 : left < right ? -1 : 1;
}

/** ISO date strings or Date values. */
export function compareNullableDate(
  a: string | Date | null | undefined,
  b: string | Date | null | undefined,
): number {
  const left = a ? new Date(a).getTime() : NaN;
  const right = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(left) && Number.isNaN(right) || (!a && !b)) return 0;
  if (Number.isNaN(left) || !a) return 1;
  if (Number.isNaN(right) || !b) return -1;
  return left === right ? 0 : left < right ? -1 : 1;
}

export type SortValueKind = "text" | "number" | "date";

export function compareSortValues(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
  kind: SortValueKind,
): number {
  if (kind === "number") return compareNullableNumber(a as number | string | null, b as number | string | null);
  if (kind === "date") return compareNullableDate(a as string | Date | null, b as string | Date | null);
  return compareNullableText(
    a == null ? null : String(a),
    b == null ? null : String(b),
  );
}

export function nextSortState<K extends string>(
  currentKey: K | null,
  currentDir: SortDir,
  clickedKey: K,
): { key: K; dir: SortDir } {
  if (currentKey === clickedKey) {
    return { key: clickedKey, dir: currentDir === "asc" ? "desc" : "asc" };
  }
  return { key: clickedKey, dir: "asc" };
}

export function sortRows<T, K extends string>(
  rows: T[],
  sortKey: K | null,
  sortDir: SortDir,
  getters: Record<K, (row: T) => string | number | Date | null | undefined>,
  kinds: Partial<Record<K, SortValueKind>> = {},
  tieBreaker?: (a: T, b: T) => number,
): T[] {
  if (!sortKey) return rows;
  const getValue = getters[sortKey];
  if (!getValue) return rows;
  const kind = kinds[sortKey] ?? "text";
  const factor = sortDir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const cmp = compareSortValues(getValue(a), getValue(b), kind) * factor;
    if (cmp !== 0) return cmp;
    return tieBreaker ? tieBreaker(a, b) : 0;
  });
}
