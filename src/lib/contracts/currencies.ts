/** Contract currency catalog. Stored values are exactly these three. */
export const CURRENCY_OPTIONS = ['UDI', 'PESO', 'DOLAR'] as const;

export type CurrencyCode = (typeof CURRENCY_OPTIONS)[number];

/** UI labels for the catalog. */
export const CURRENCY_LABELS: Record<string, string> = { PESO: 'Pesos', DOLAR: 'Dólares', UDI: 'UDI' };

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

const amountEs = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Amount with its póliza currency: `$1,200.00`, `US$1,200.00`, `1,200.00 UDI`. */
export function formatAmount(value: number | null | undefined, currency: string | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  const code = normalizeCurrency(currency);
  if (code === 'UDI') return `${amountEs.format(value)} UDI`;
  if (code === 'DOLAR') return `US$${amountEs.format(value)}`;
  return `$${amountEs.format(value)}`;
}
