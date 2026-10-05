/**
 * Shared next-collection date math for Cobranza + docs.
 * Last known payment (prior / marca / detalle) wins over old commission lines.
 */

export const FORMA_PAGO_MONTHS: Record<string, number> = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
};

export function paymentMethodMonths(paymentMethod: string | null | undefined): number {
  if (!paymentMethod?.trim()) return FORMA_PAGO_MONTHS.Mensual;
  return FORMA_PAGO_MONTHS[paymentMethod.trim()] ?? FORMA_PAGO_MONTHS.Mensual;
}

export function parseIsoLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

export function addMonthsLocal(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Clamp day-of-month into a calendar month (31 → 28/29 in Feb). */
export function dateWithDayOfMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastDay));
}

/**
 * Next due after the last known payment.
 * Uses forma de pago for the step; prefers `collection_day` for the day-of-month.
 *
 * Example: lastPaid=2026-10-05, Mensual, collection_day=5 → 2026-11-05
 */
export function nextDueFromLastPayment(
  lastPaidAt: string | null | undefined,
  paymentMethod: string | null | undefined,
  collectionDay?: number | null,
): Date | null {
  if (!lastPaidAt) return null;
  const base = parseIsoLocal(lastPaidAt.slice(0, 10));
  if (!base) return null;

  const stepped = addMonthsLocal(base, paymentMethodMonths(paymentMethod));
  const day =
    collectionDay != null && Number.isFinite(collectionDay) && collectionDay >= 1
      ? Math.trunc(collectionDay)
      : stepped.getDate();

  return dateWithDayOfMonth(stepped.getFullYear(), stepped.getMonth(), day);
}

/** Pick the chronologically latest ISO date among candidates. */
export function maxIsoDate(
  ...candidates: Array<string | null | undefined>
): string | null {
  let best: string | null = null;
  for (const raw of candidates) {
    if (!raw || !/^\d{4}-\d{2}-\d{2}/.test(raw)) continue;
    const iso = raw.slice(0, 10);
    if (!best || iso > best) best = iso;
  }
  return best;
}
