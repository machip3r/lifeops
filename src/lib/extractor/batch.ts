/** Single batch size for all Excel/HTML import chunks (API + DB). */
export const IMPORT_BATCH_SIZE = 500;

export const EXTRACTOR_DETAIL_CHECK_BATCH = IMPORT_BATCH_SIZE;
export const EXTRACTOR_CONTRACT_NUMBER_BATCH = IMPORT_BATCH_SIZE;
export const EXTRACTOR_CONSULTANT_CREATE_BATCH = IMPORT_BATCH_SIZE;
export const EXTRACTOR_DB_IN_BATCH = IMPORT_BATCH_SIZE;

export function chunkArray<T>(items: T[], size: number = IMPORT_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
