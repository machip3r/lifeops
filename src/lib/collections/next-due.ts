/**
 * Shared next-collection date math for Cobranza + docs.
 * Last known payment (prior / marca / detalle) wins over old commission lines.
 */
import { POLICY_AT_RISK_DAYS } from "@/lib/collections/constants";

/** @lintignore Only used by src/parked. */
export const FORMA_PAGO_MONTHS: Record<string, number> = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
};

/** Months between receipts; same rule as SQL `payment_method_step_months` (case-insensitive, codes 1/2/4/5). */
function paymentMethodMonths(paymentMethod: string | null | undefined): number {
  const value = paymentMethod?.trim().toLowerCase() ?? '';
  if (/^(anual|1|01)(\b|[^a-z0-9]|$)/.test(value)) return FORMA_PAGO_MONTHS.Anual;
  if (/^(semestral|2|02)(\b|[^a-z0-9]|$)/.test(value)) return FORMA_PAGO_MONTHS.Semestral;
  if (/^(trimestral|4|04)(\b|[^a-z0-9]|$)/.test(value)) return FORMA_PAGO_MONTHS.Trimestral;
  return FORMA_PAGO_MONTHS.Mensual;
}

function parseIsoLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

function addMonthsLocal(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMonth(d.getMonth() + months);
  return d;
}

/** Clamp day-of-month into a calendar month (31 → 28/29 in Feb). */
function dateWithDayOfMonth(year: number, monthIndex: number, day: number): Date {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(Math.max(1, day), lastDay));
}

/** Fallback without FECHA EMISION: last payment + forma de pago (day = collection_day or same day). */
function nextDueFromLastPayment(
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

/** A payment up to this many days before a receipt's due date counts for that receipt. */
const EARLY_PAYMENT_DAYS = 15;

/**
 * Next receipt due from the póliza calendar: FECHA EMISION + forma de pago (same rule as
 * SQL `next_collection_due`). The last payment covers the latest receipt due on or before
 * payment date + 15 days.
 *
 * Example: emisión 2025-12-20, Trimestral (dic, mar, jun, sep), last paid 2026-07-21
 * (jun receipt, late) → 2026-09-20. Without issue date: last payment + period.
 */
export function nextCollectionDue(input: {
  issueDate?: string | null;
  lastPaidAt?: string | null;
  paymentMethod?: string | null;
  collectionDay?: number | null;
}): Date | null {
  const issue = input.issueDate ? parseIsoLocal(input.issueDate.slice(0, 10)) : null;
  if (!issue) return nextDueFromLastPayment(input.lastPaidAt, input.paymentMethod, input.collectionDay);
  if (!input.lastPaidAt) return issue;
  const paid = parseIsoLocal(input.lastPaidAt.slice(0, 10));
  if (!paid) return issue;

  const step = paymentMethodMonths(input.paymentMethod);
  const receipt = (k: number) =>
    dateWithDayOfMonth(issue.getFullYear(), issue.getMonth() + k * step, issue.getDate());
  const ref = new Date(paid.getFullYear(), paid.getMonth(), paid.getDate() + EARLY_PAYMENT_DAYS);
  const months = (ref.getFullYear() - issue.getFullYear()) * 12 + ref.getMonth() - issue.getMonth();
  let k = Math.floor(months / step);
  if (receipt(k) > ref) k -= 1;
  return k < 0 ? issue : receipt(k + 1);
}

export type ReceiptPayment = {
  /** YYYY-MM-DD */
  paidAt: string;
  source: "manual" | "import";
  amount: number | null;
  /** RECIBO number or payment notes */
  reference: string | null;
  /** Evidence document of a cobranza payment, when uploaded */
  evidenceFileId?: string | null;
};

export type CalendarReceipt = {
  /** 0 = emission receipt */
  index: number;
  /** Position within the policy year (1…perYear) */
  number: number;
  perYear: number;
  due: Date;
  payments: ReceiptPayment[];
  /** paid: has a payment · covered: before the last paid receipt, no payment of its own · pending */
  state: "paid" | "covered" | "pending";
};

/**
 * Receipt calendar of a póliza (FECHA EMISION + forma de pago) with each payment placed on
 * the receipt it covers — same rule as `nextCollectionDue`. Goes up to today plus `upcoming`
 * receipts. Null without issue date.
 */
export function receiptCalendar(input: {
  issueDate?: string | null;
  paymentMethod?: string | null;
  payments: ReceiptPayment[];
  today?: Date;
  upcoming?: number;
}): { receipts: CalendarReceipt[]; nextIndex: number } | null {
  const issue = input.issueDate ? parseIsoLocal(input.issueDate.slice(0, 10)) : null;
  if (!issue) return null;
  const now = input.today ?? new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const step = paymentMethodMonths(input.paymentMethod);
  const perYear = Math.max(1, Math.round(12 / step));
  const receipt = (k: number) =>
    dateWithDayOfMonth(issue.getFullYear(), issue.getMonth() + k * step, issue.getDate());
  /** Latest receipt due on or before `ref` (−1 = before emission). */
  const indexAtOrBefore = (ref: Date) => {
    const months = (ref.getFullYear() - issue.getFullYear()) * 12 + ref.getMonth() - issue.getMonth();
    let k = Math.floor(months / step);
    if (receipt(k) > ref) k -= 1;
    return k;
  };

  const byIndex = new Map<number, ReceiptPayment[]>();
  let lastCovered = -1;
  for (const payment of input.payments) {
    const paid = parseIsoLocal(payment.paidAt.slice(0, 10));
    if (!paid) continue;
    const k = indexAtOrBefore(
      new Date(paid.getFullYear(), paid.getMonth(), paid.getDate() + EARLY_PAYMENT_DAYS),
    );
    if (k < 0) continue;
    byIndex.set(k, [...(byIndex.get(k) ?? []), payment]);
    lastCovered = Math.max(lastCovered, k);
  }

  const nextIndex = lastCovered + 1;
  const last = Math.max(nextIndex, indexAtOrBefore(today)) + (input.upcoming ?? 2);
  const receipts: CalendarReceipt[] = [];
  for (let k = 0; k <= last; k++) {
    const payments = byIndex.get(k) ?? [];
    receipts.push({
      index: k,
      number: (k % perYear) + 1,
      perYear,
      due: receipt(k),
      payments,
      state: payments.length > 0 ? "paid" : k < nextIndex ? "covered" : "pending",
    });
  }
  return { receipts, nextIndex };
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

/** Initial cobranza estatus for a new póliza: ATRASADO when its next due is past the at-risk window. */
export function initialCollectionStatus(
  nextDue: Date | null,
  today: Date = new Date(),
): "CORRIENTE" | "ATRASADO" {
  if (!nextDue) return "CORRIENTE";
  const daysLate = Math.floor((today.getTime() - nextDue.getTime()) / (1000 * 60 * 60 * 24));
  return daysLate > POLICY_AT_RISK_DAYS ? "ATRASADO" : "CORRIENTE";
}

/** Position of a receipt due date in the policy year (`3/12`); null without issue date. */
export function receiptPosition(
  issueDate: string | null | undefined,
  paymentMethod: string | null | undefined,
  due: Date | null | undefined,
): { number: number; perYear: number } | null {
  const issue = issueDate ? parseIsoLocal(issueDate.slice(0, 10)) : null;
  if (!issue || !due) return null;
  const step = paymentMethodMonths(paymentMethod);
  const perYear = Math.max(1, Math.round(12 / step));
  const months = (due.getFullYear() - issue.getFullYear()) * 12 + due.getMonth() - issue.getMonth();
  const k = Math.round(months / step);
  if (k < 0) return null;
  return { number: (k % perYear) + 1, perYear };
}
