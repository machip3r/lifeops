/** Contract currency catalog. Stored values are exactly these three. */
export const CURRENCY_OPTIONS = ['UDI', 'PESO', 'DOLAR'] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

export function isCurrencyCode(value: string): value is CurrencyCode {
  return (CURRENCY_OPTIONS as readonly string[]).includes(value);
}

function foldCurrency(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/** Map legacy extractor / OCR labels onto the catalog. Unknown text stays empty. */
export function normalizeCurrency(value: string | null | undefined): CurrencyCode | '' {
  const raw = foldCurrency(value ?? '');
  if (!raw) return '';
  if (raw.includes('UDI')) return 'UDI';
  if (raw.includes('PESO') || raw === 'MXN' || raw === 'MX') return 'PESO';
  if (raw.includes('DOLAR') || raw.includes('DOLLAR') || raw === 'USD') return 'DOLAR';
  return '';
}

/** Catalog value when recognized; otherwise the trimmed original, capped for the column. */
export function currencyToStore(value: string | null | undefined): string | null {
  const normalized = normalizeCurrency(value);
  if (normalized) return normalized;
  const raw = (value ?? '').trim().slice(0, 16);
  return raw || null;
}
