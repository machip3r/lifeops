const MONTH_SHORT_ES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

/**
 * Format a date as DD/Mmm/YYYY (e.g. 05/Oct/2026).
 * Accepts ISO date strings, Date, or nullish → "—".
 */
export function formatDateShortEs(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "string" ? parseDateInput(value) : value;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = MONTH_SHORT_ES[d.getUTCMonth()] ?? "—";
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Local calendar date (no UTC shift) for date-only UI values. */
export function formatDateShortEsLocal(
  value: string | Date | null | undefined,
): string {
  if (value == null || value === "") return "—";
  const d = typeof value === "string" ? parseDateInput(value) : value;
  if (!d || Number.isNaN(d.getTime())) return "—";
  const day = String(d.getDate()).padStart(2, "0");
  const month = MONTH_SHORT_ES[d.getMonth()] ?? "—";
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // YYYY-MM-DD → treat as local calendar date
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [y, m, day] = trimmed.split("-").map(Number);
    return new Date(y, m - 1, day);
  }
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
