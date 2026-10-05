/** Single batch size for all HTML import chunks (API + DB). */
export const IMPORT_BATCH_SIZE = 500;

export function chunkArray<T>(items: T[], size: number = IMPORT_BATCH_SIZE): T[][] {
  if (size <= 0) throw new Error("chunk size must be positive");
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
