/** Minimum similarity (0–1) to treat two client names as the same person. */
export const CLIENT_NAME_MATCH_THRESHOLD = 0.86;

const MAX_CLIENT_NAME_LENGTH = 120;

/**
 * Trim, collapse spaces, uppercase, drop accents.
 * Ñ becomes N, so "José  Núñez" becomes "JOSE NUNEZ".
 */
export function normalizeClientName(value: string): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (!compact) return '';
  const upper = compact.toLocaleUpperCase('es-MX');
  const withoutAccents = upper.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return withoutAccents
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CLIENT_NAME_LENGTH)
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    const code = a.charCodeAt(i - 1);
    for (let j = 1; j <= b.length; j += 1) {
      const cost = code === b.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  if (max === 0) return 1;
  return 1 - levenshtein(a, b) / max;
}

function sortedTokens(value: string): string {
  return value.split(' ').filter(Boolean).sort().join(' ');
}

/** 1 when the normalized names are equal, otherwise Levenshtein on the full name and on sorted words. */
export function clientNameSimilarity(left: string, right: string): number {
  const a = normalizeClientName(left);
  const b = normalizeClientName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  return Math.max(ratio(a, b), ratio(sortedTokens(a), sortedTokens(b)));
}

/**
 * Best existing name at or above the threshold.
 * Returns the normalized existing name. Skips a close tie between two different clients.
 */
export function bestClientNameMatch(
  incoming: string,
  existingNames: string[],
): string | null {
  const wanted = normalizeClientName(incoming);
  if (!wanted || existingNames.length === 0) return null;

  let bestName = '';
  let bestScore = 0;
  let secondScore = 0;

  for (const candidate of existingNames) {
    const canon = normalizeClientName(candidate);
    if (!canon) continue;
    const score = clientNameSimilarity(wanted, canon);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      bestName = canon;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!bestName || bestScore < CLIENT_NAME_MATCH_THRESHOLD) return null;
  if (
    bestScore < 1 &&
    secondScore >= CLIENT_NAME_MATCH_THRESHOLD &&
    bestScore - secondScore < 0.03
  ) {
    return null;
  }
  return bestName;
}
