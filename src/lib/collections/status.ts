import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from "@/lib/collections/constants";

/**
 * Cartera status of a póliza by its next due (same buckets as SQL `get_collection_overview`,
 * the at-risk and pending lists, Cobranza and the Vista general charts).
 */
export type CarteraStatus = "current" | "due_soon" | "overdue" | "at_risk" | "no_payment";

/** Label + chart color token per status (colors validated in `globals.css`). */
export const CARTERA_STATUS: Record<CarteraStatus, { label: string; color: string }> = {
  current: { label: "Al corriente", color: "var(--viz-current)" },
  due_soon: { label: "Por vencer", color: "var(--viz-due-soon)" },
  overdue: { label: "Vencida", color: "var(--viz-overdue)" },
  at_risk: { label: "En peligro", color: "var(--viz-at-risk)" },
  no_payment: { label: "Sin fecha de cobro", color: "var(--lifeops-muted)" },
};

/** Pólizas list adds `inactive` (póliza not en vigor: anulada, prorrogada, sin pago de primas) to the cartera buckets. */
export type PortfolioStatus = CarteraStatus | "inactive";

export const PORTFOLIO_STATUS: Record<PortfolioStatus, { label: string; color: string }> = {
  ...CARTERA_STATUS,
  inactive: { label: "Fuera de cobranza", color: "var(--viz-last-year)" },
};

/** Days from due date to today (positive = overdue). */
export function daysPastDue(due: Date | null | undefined, now = new Date()): number | null {
  if (!due) return null;
  const start = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}

export function carteraStatus(due: Date | null | undefined, now = new Date()): CarteraStatus {
  const past = daysPastDue(due, now);
  if (past == null) return "no_payment";
  if (past > POLICY_AT_RISK_DAYS) return "at_risk";
  if (past > 0) return "overdue";
  if (-past <= PENDING_PAYMENT_WITHIN_DAYS) return "due_soon";
  return "current";
}
