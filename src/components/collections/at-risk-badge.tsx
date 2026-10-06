'use client';

import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';

type Props = {
  /** Days past expected cobro without payment. */
  daysOverdue?: number | null;
  className?: string;
};

/** Compact status chip for pólizas / cobranza lists. */
export function AtRiskBadge({ daysOverdue, className = '' }: Props) {
  const days =
    daysOverdue != null && Number.isFinite(daysOverdue)
      ? Math.max(0, Math.trunc(daysOverdue))
      : null;

  return (
    <span
      className={`inline-flex items-center rounded-md bg-red-500/15 px-2 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-500/40 ${className}`}
      title={
        days != null
          ? `Sin pago más de ${POLICY_AT_RISK_DAYS} días (atraso: ${days})`
          : `Sin pago más de ${POLICY_AT_RISK_DAYS} días después del cobro esperado`
      }
    >
      En peligro
      {days != null ? ` · ${days}d` : ''}
    </span>
  );
}

export function OverdueBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-inset ring-amber-500/40 ${className}`}
      title="Fecha de cobro ya pasó; aún dentro de la ventana de gracia"
    >
      Vencida
    </span>
  );
}

/** Days from due date to today (positive = overdue). */
export function daysPastDue(due: Date | null | undefined, now = new Date()): number | null {
  if (!due) return null;
  const start = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - start.getTime()) / 86_400_000);
}
