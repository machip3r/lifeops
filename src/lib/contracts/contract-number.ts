/**
 * Canonical póliza number, the key that links manual registration, commission files (HTML),
 * Mina de Oro and plantilla: no spaces or thousands commas, uppercase ("vi 123,456" → "VI123456").
 * Same rule as migration `038_normalize_contract_numbers`.
 */
export function normalizeContractNumber(raw: unknown): string {
  return String(raw ?? "")
    .replace(/[\s,]+/g, "")
    .toUpperCase();
}
