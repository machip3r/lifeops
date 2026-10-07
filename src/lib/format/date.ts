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

/** Parse DD/MM/YYYY, D/M/YYYY or ISO → YYYY-MM-DD */
export function parseFlexibleDateToIso(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (
    dt.getFullYear() !== yyyy ||
    dt.getMonth() !== mm - 1 ||
    dt.getDate() !== dd
  ) {
    return null;
  }
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/** Format ISO YYYY-MM-DD as DD/MM/YYYY for keyboard entry. */
export function isoToDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}
