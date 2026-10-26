/** Cell parsers shared by the commission import (HTML extractor rows are strings). */

/** Canonical header key: uppercase, no accents, no spaces/punctuation. */
export function normalizeHeader(header?: string | null): string {
  return (header || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** DD/MM/YYYY or ISO → YYYY-MM-DD. */
export function parseDate(value: string | null): string | null {
  if (!value || !value.trim()) return null;
  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parts = trimmed.split("/");
  if (parts.length === 3) {
    const day = parts[0].padStart(2, "0");
    const month = parts[1].padStart(2, "0");
    return `${parts[2]}-${month}-${day}`;
  }
  return null;
}

/** Amount with thousands separators → number (also TIPO CAMBIO). */
export function parseNumeric(value: string | null): number | null {
  if (!value || !value.trim() || value.trim() === "NULL") return null;
  const parsed = parseFloat(value.trim().replace(/,/g, "").replace(/\s/g, ""));
  return isNaN(parsed) ? null : parsed;
}

/** FORMA DE PAGO code or label → catalog value (Anual / Semestral / Trimestral / Mensual). */
export function normalizePaymentMethod(value: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase().replace(/\([^)]*\)/g, "").trim();
  switch (raw) {
    case "1":
    case "01":
    case "anual":
      return "Anual";
    case "2":
    case "02":
    case "semestral":
      return "Semestral";
    case "4":
    case "04":
    case "trimestral":
      return "Trimestral";
    case "5":
    case "05":
    case "mensual":
      return "Mensual";
    default:
      return value.trim();
  }
}
