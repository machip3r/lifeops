/**
 * Client-side input filters: drop characters the server schema would reject while the user
 * types (UX only — Zod in `schemas.ts` stays authoritative). Pair them with `maxLength`.
 */

/** Letters (incl. accents), spaces, apostrophe, period, hyphen — mirrors PERSON_NAME_PATTERN. */
export function filterPersonName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\s'.-]/gu, "").replace(/\s{2,}/g, " ").trimStart();
}

/** Business names: letters, digits, spaces and . & ' + _ / - ( ) — mirrors ENTITY_NAME_PATTERN. */
export function filterEntityName(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N}\s.&'+_/()-]/gu, "").replace(/\s{2,}/g, " ").trimStart();
}

/** Clave-style codes: A–Z, 0–9 and . _ / - , uppercased, no spaces. */
export function filterCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9._/-]/g, "");
}

/** Digits only, capped. */
export function filterDigits(value: string, max: number): string {
  return value.replace(/\D/g, "").slice(0, max);
}

/** Mexican 10-digit phone as `33 1234 5678` style groups (3-3-4). */
export function formatMxPhone(digits: string): string {
  const d = filterDigits(digits, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

/** CURP / RFC: uppercase letters (incl. Ñ, &) and digits only. */
export function filterTaxId(value: string): string {
  return value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, "");
}

/** Email while typing: no spaces or control characters, lowercase. */
export function filterEmail(value: string): string {
  return value.replace(/[\s\p{Cc}]/gu, "").toLowerCase();
}

/** Amounts kept as text (prima anual, suma asegurada): digits, $ , . and spaces. */
export function filterAmountText(value: string): string {
  return value.replace(/[^0-9$.,\s]/g, "").replace(/\s{2,}/g, " ").trimStart();
}

/** Receipt amounts (comisiones can be negative): a leading minus, digits, $ , . and spaces. */
export function filterSignedAmountText(value: string): string {
  const trimmed = value.trimStart();
  const sign = trimmed.startsWith("-") ? "-" : "";
  return sign + filterAmountText(trimmed.slice(sign.length));
}

/** Short free labels from the commission files (movimiento, antigüedad): no control chars or < >. */
export function filterLabelText(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N}\s.,:;'#&()/+%_-]/gu, "").replace(/\s{2,}/g, " ").trimStart();
}
