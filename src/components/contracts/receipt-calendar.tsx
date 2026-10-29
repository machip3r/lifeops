'use client';

import { useState, type ReactNode } from 'react';
import { CalendarX, Paperclip } from 'lucide-react';
import { DotBadge } from '@/components/ui/dot-badge';
import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { MissingPaymentMethodNotice } from '@/components/contracts/missing-payment-method';
import type { CalendarReceipt, ReceiptPayment } from '@/lib/collections/next-due';
import { carteraStatus, daysPastDue } from '@/lib/collections/status';
import { formatAmount } from '@/lib/contracts/currencies';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { cn } from '@/lib/utils';

/** Receipts shown before the next one until the user expands the full history. */
const RECENT_RECEIPTS = 4;

const SOURCE_LABEL: Record<ReceiptPayment['source'], string> = {
  import: 'archivo de comisiones',
  manual: 'registrado en cobranza',
};

function paymentLine(payment: ReceiptPayment, currency: string | null | undefined): string {
  return [
    `Pagado el ${formatDateShortEsLocal(payment.paidAt.slice(0, 10))}`,
    SOURCE_LABEL[payment.source],
    formatAmount(payment.amount, currency),
    payment.reference,
  ]
    .filter(Boolean)
    .join(' · ');
}

function pendingLine(due: Date): string {
  const days = daysPastDue(due) ?? 0;
  if (days > 0) return days === 1 ? '1 día de atraso' : `${days} días de atraso`;
  if (days === 0) return 'Vence hoy';
  return days === -1 ? 'Vence mañana' : `Vence en ${-days} días`;
}

function ReceiptRow({
  receipt,
  isNext,
  currency,
  onOpenEvidence,
}: {
  receipt: CalendarReceipt;
  isNext: boolean;
  currency: string | null | undefined;
  onOpenEvidence?: (fileId: string) => void;
}) {
  const status = carteraStatus(receipt.due);
  return (
    <li
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-2.5 sm:px-5',
        isNext && 'bg-(--lifeops-hover)/60 shadow-[inset_3px_0_0_var(--lifeops-accent)]',
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-(--lifeops-fg)">
          <span className="tabular-nums">
            {receipt.number}/{receipt.perYear}
          </span>
          {' · '}
          {formatDateShortEsLocal(receipt.due)}
          {isNext ? <span className="ml-2 text-xs font-normal text-(--lifeops-accent)">Próximo cobro</span> : null}
        </p>
        <div className="mt-0.5 space-y-0.5 text-xs text-(--lifeops-muted)">
          {receipt.state === 'paid'
            ? receipt.payments.map((payment, i) => (
                <p key={i} className="flex flex-wrap items-center gap-x-2">
                  <span>{paymentLine(payment, currency)}</span>
                  {payment.evidenceFileId && onOpenEvidence ? (
                    <button
                      type="button"
                      onClick={() => onOpenEvidence(payment.evidenceFileId!)}
                      className="inline-flex cursor-pointer items-center gap-1 font-medium text-(--lifeops-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
                    >
                      <Paperclip className="h-3 w-3" aria-hidden />
                      Ver evidencia
                    </button>
                  ) : null}
                </p>
              ))
            : receipt.state === 'covered'
              ? <p>Sin pago propio; lo cubre un pago posterior</p>
              : receipt.state === 'insurer'
                ? <p>Sin pago registrado en LifeOps; la aseguradora reporta la póliza en vigor</p>
                : <p>{pendingLine(receipt.due)}</p>}
        </div>
      </div>
      {receipt.state === 'paid' ? (
        <DotBadge label="Pagado" color="var(--viz-current)" />
      ) : receipt.state === 'covered' ? (
        <DotBadge label="Sin registro" color="var(--lifeops-muted)" />
      ) : receipt.state === 'insurer' ? (
        <DotBadge label="Al día según aseguradora" color="var(--viz-current)" />
      ) : status === 'current' ? (
        <DotBadge label="Programado" color="var(--viz-last-year)" />
      ) : (
        <CarteraStatusBadge status={status} daysOverdue={daysPastDue(receipt.due)} />
      )}
    </li>
  );
}

/** Receipt calendar card: paid / pending receipts from FECHA EMISION + forma de pago. */
export function ReceiptCalendar({
  calendar,
  payments,
  issueDate,
  paymentMethod,
  currency,
  actions,
  onCompletePaymentMethod,
  onOpenEvidence,
}: {
  calendar: { receipts: CalendarReceipt[]; nextIndex: number } | null;
  /** All known payments (shown as a list when there is no calendar) */
  payments: ReceiptPayment[];
  issueDate: string | null | undefined;
  paymentMethod: string | null | undefined;
  currency: string | null | undefined;
  actions?: ReactNode;
  /** Shown when the póliza has no forma de pago (opens the edit dialog) */
  onCompletePaymentMethod?: () => void;
  /** Opens a payment's evidence document */
  onOpenEvidence?: (fileId: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const receipts = calendar?.receipts ?? [];
  const start = showAll ? 0 : Math.max(0, (calendar?.nextIndex ?? 0) - RECENT_RECEIPTS);
  const visible = receipts.slice(start);
  const paidCount = receipts.filter((r) => r.state === 'paid').length;

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5 sm:pt-6">
        <div>
          <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">Calendario de recibos</h2>
          <p className="mt-0.5 text-sm text-(--lifeops-muted)">
            {calendar
              ? `${paymentMethod?.trim() || 'Mensual (sin forma de pago)'} desde la emisión del ${formatDateShortEsLocal(issueDate)} · ${paidCount} con pago registrado`
              : 'Pagos registrados de la póliza'}
          </p>
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      {!paymentMethod?.trim() ? (
        <MissingPaymentMethodNotice
          className="mx-4 mb-3 sm:mx-5"
          action={
            onCompletePaymentMethod ? (
              <button
                type="button"
                onClick={onCompletePaymentMethod}
                className="rounded text-sm text-(--lifeops-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
              >
                Completar forma de pago
              </button>
            ) : null
          }
        />
      ) : null}

      {calendar ? (
        <>
          <ul className="divide-y divide-(--lifeops-border) border-t border-(--lifeops-border)">
            {visible.map((receipt) => (
              <ReceiptRow
                key={receipt.index}
                receipt={receipt}
                isNext={receipt.index === calendar.nextIndex}
                currency={currency}
                onOpenEvidence={onOpenEvidence}
              />
            ))}
          </ul>
          {start > 0 || showAll ? (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="border-t border-(--lifeops-border) px-4 py-3 text-center text-sm text-(--lifeops-accent) hover:bg-(--lifeops-hover) focus-visible:bg-(--lifeops-hover) focus-visible:outline-none sm:px-5"
            >
              {showAll ? 'Ver solo los recientes' : `Ver desde la emisión (${receipts.length} recibos)`}
            </button>
          ) : null}
        </>
      ) : (
        <div className="border-t border-(--lifeops-border)">
          <p className="flex items-start gap-2 px-4 py-4 text-sm text-(--lifeops-fg) sm:px-5">
            <CalendarX className="mt-0.5 h-4 w-4 shrink-0 text-(--lifeops-muted)" aria-hidden />
            Sin fecha de emisión no se puede armar el calendario de recibos. Agrégala con «Editar».
          </p>
          {payments.length > 0 ? (
            <ul className="divide-y divide-(--lifeops-border) border-t border-(--lifeops-border)">
              {payments.map((payment, i) => (
                <li key={i} className="px-4 py-3 text-sm text-(--lifeops-fg) sm:px-5">
                  {paymentLine(payment, currency)}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </section>
  );
}
