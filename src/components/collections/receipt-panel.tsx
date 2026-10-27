'use client';

import Link from 'next/link';
import { MessageCircle, MousePointerClick, Phone } from 'lucide-react';
import type { CollectionBoardRow } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { DetailRow, DetailRows } from '@/components/dashboard/detail-card';
import { MissingPaymentMethodFlag, MissingPaymentMethodNotice } from '@/components/contracts/missing-payment-method';
import { receiptPosition } from '@/lib/collections/next-due';
import { formatAmount } from '@/lib/contracts/currencies';
import { formatDateShortEsLocal, formatDayMonthLongEs, isoToLocalDate } from '@/lib/format/date';
import { formatMxPhone } from '@/lib/validation/input-filters';

export function dueLabel(days: number | null): string {
  if (days == null) return '—';
  if (days === 0) return 'Hoy';
  if (days > 0) return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
  return days === -1 ? 'Mañana' : `En ${-days} días`;
}

/** Reminder text for the client (natural Spanish, no internal jargon). */
function reminderText(row: CollectionBoardRow, due: Date): string {
  const firstName = row.client_name?.trim().split(/\s+/)[0] ?? '';
  const greeting = firstName ? `Hola ${firstName}` : 'Hola';
  const policy = row.contract_number ? ` de tu póliza ${row.contract_number}` : '';
  const when = formatDayMonthLongEs(due);
  if ((row.days_past_due ?? 0) > 0) {
    return `${greeting}, el recibo${policy} venció el ${when}. ¿Nos ayudas a confirmar tu pago? Si ya lo hiciste, compártenos tu comprobante. ¡Gracias!`;
  }
  return `${greeting}, te recordamos que el recibo${policy} vence el ${when}. Si ya lo pagaste, ignora este mensaje. ¡Gracias!`;
}

/** Side panel for the receipt picked on the Cobranza board: facts + register payment + WhatsApp reminder. */
export function ReceiptPanel({
  row,
  onRegisterPayment,
  onAddPhone,
}: {
  row: CollectionBoardRow | null;
  onRegisterPayment: (row: CollectionBoardRow) => void;
  /** Opens the client edit dialog (phone missing) */
  onAddPhone?: (row: CollectionBoardRow) => void;
}) {
  if (!row) {
    return (
      <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4 sm:p-5">
        <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">Registrar pago</h2>
        <p className="mt-3 flex items-start gap-2 text-sm text-(--lifeops-muted)">
          <MousePointerClick className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          Elige un recibo de la lista para ver su detalle, registrar el pago o mandar un recordatorio al cliente.
        </p>
      </section>
    );
  }

  const due = isoToLocalDate(row.next_due);
  const position = receiptPosition(row.issue_date, row.payment_method, due);
  const amount = formatAmount(row.amount, row.currency);
  const whatsapp =
    row.client_phone && due
      ? `https://wa.me/52${row.client_phone}?text=${encodeURIComponent(reminderText(row, due))}`
      : null;

  return (
    <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="flex items-start justify-between gap-3 border-b border-(--lifeops-border) px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 className="truncate font-mono text-[15px] font-semibold text-(--lifeops-fg)">
            {row.contract_number || 'Sin número'}
            {position ? (
              <span className="ml-2 font-sans text-sm font-normal text-(--lifeops-muted)">
                recibo {position.number}/{position.perYear}
              </span>
            ) : null}
          </h2>
          <p className="truncate text-sm text-(--lifeops-muted)">{row.client_name || 'Cliente sin nombre'}</p>
        </div>
        {amount ? <p className="shrink-0 text-lg font-semibold tabular-nums text-(--lifeops-fg)">{amount}</p> : null}
      </header>

      <div className="px-4 py-3 sm:px-5">
        <DetailRows>
          <DetailRow label="Vence">{due ? formatDateShortEsLocal(due) : '—'}</DetailRow>
          <DetailRow label="Antigüedad">{dueLabel(row.days_past_due)}</DetailRow>
          <DetailRow label="Estado">
            <CarteraStatusBadge status={row.cartera_status} daysOverdue={row.days_past_due} />
          </DetailRow>
          <DetailRow label="Forma de pago">{row.payment_method || <MissingPaymentMethodFlag />}</DetailRow>
          <DetailRow label="Último pago">
            {row.last_paid_at ? formatDateShortEsLocal(row.last_paid_at.slice(0, 10)) : 'Sin pagos'}
          </DetailRow>
          <DetailRow label="Teléfono">{row.client_phone ? formatMxPhone(row.client_phone) : '—'}</DetailRow>
          <DetailRow label="Asesor">{row.consultant_name || '—'}</DetailRow>
        </DetailRows>
      </div>

      <div className="flex flex-col gap-2 border-t border-(--lifeops-border) px-4 py-3 sm:px-5">
        {!row.payment_method?.trim() ? (
          <MissingPaymentMethodNotice
            className="mb-1"
            action={
              <Link
                href={`/dashboard/contracts/${row.contract_id}`}
                className="text-sm text-(--lifeops-accent) hover:underline"
              >
                Complétala en el expediente de la póliza
              </Link>
            }
          />
        ) : null}
        <Button type="button" variant="brand" size="lg" onClick={() => onRegisterPayment(row)}>
          Registrar pago
        </Button>
        {whatsapp ? (
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={() => window.open(whatsapp, '_blank', 'noopener,noreferrer')}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            Enviar recordatorio
          </Button>
        ) : (
          <div className="rounded-lg bg-(--lifeops-hover)/40 px-3 py-2.5 text-xs text-(--lifeops-muted)">
            <p>Sin teléfono del cliente; no se le puede mandar recordatorio</p>
            {row.client_id && onAddPhone ? (
              <button
                type="button"
                onClick={() => onAddPhone(row)}
                className="mt-1.5 inline-flex cursor-pointer items-center gap-1.5 font-medium text-(--lifeops-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
              >
                <Phone className="h-3.5 w-3.5" aria-hidden />
                Registra su número de teléfono
              </button>
            ) : null}
          </div>
        )}
        <Link
          href={`/dashboard/contracts/${row.contract_id}`}
          className="pt-1 text-center text-sm text-(--lifeops-accent) hover:underline"
        >
          Ver expediente de la póliza
        </Link>
      </div>
    </section>
  );
}
