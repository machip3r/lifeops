'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ChevronRight, CircleCheck } from 'lucide-react';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import {
  PENDING_PAYMENT_WITHIN_DAYS,
  POLICY_AT_RISK_DAYS,
} from '@/lib/collections/constants';
import { CARTERA_STATUS } from '@/lib/collections/status';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { FilterChips } from '@/components/ui/filter-chips';

type Props = {
  atRisk: ContractAtRisk[];
  pending: ContractPendingPayment[];
  /** Show consultant name (office-wide views). */
  showConsultant?: boolean;
};

/** Same states, order and colors as the Vista general charts (critical first). */
const PRIORITY_STATES = ['at_risk', 'overdue', 'due_soon'] as const;
type PriorityState = (typeof PRIORITY_STATES)[number];
type Filter = 'all' | PriorityState;

type PriorityRow = {
  contractId: string;
  contractNumber: string;
  clientName: string;
  consultantName: string | null;
  dueDate: string;
  status: PriorityState;
  /** Positive = days late, 0 = today, negative = days ahead */
  daysPastDue: number;
  href: string;
};

const VISIBLE_ROWS = 8;

function toRows(atRisk: ContractAtRisk[], pending: ContractPendingPayment[]): PriorityRow[] {
  const rows: PriorityRow[] = atRisk.map((row) => ({
    contractId: row.contract_id,
    contractNumber: row.contract_number || 'Sin número',
    clientName: row.client_name || 'Cliente sin nombre',
    consultantName: row.consultant_name ?? null,
    dueDate: row.due_date,
    status: 'at_risk',
    daysPastDue: row.days_overdue,
    href: `/dashboard/contracts/${row.contract_id}`,
  }));
  const seen = new Set(rows.map((row) => row.contractId));
  for (const row of pending) {
    if (seen.has(row.contract_id)) continue;
    rows.push({
      contractId: row.contract_id,
      contractNumber: row.contract_number || 'Sin número',
      clientName: row.client_name || 'Cliente sin nombre',
      consultantName: row.consultant_name ?? null,
      dueDate: row.due_date,
      status: row.is_overdue ? 'overdue' : 'due_soon',
      daysPastDue: -row.days_until_due,
      href: '/dashboard/collections',
    });
  }
  // Most urgent first: by state, then the longest overdue / the closest due
  return rows.sort(
    (a, b) =>
      PRIORITY_STATES.indexOf(a.status) - PRIORITY_STATES.indexOf(b.status) ||
      b.daysPastDue - a.daysPastDue,
  );
}

function timing(days: number): string {
  if (days === 0) return 'Hoy';
  if (days > 0) return days === 1 ? 'Hace 1 día' : `Hace ${days} días`;
  return days === -1 ? 'Mañana' : `En ${-days} días`;
}

/** Collection priority (at risk → overdue → due soon) in the Vista general chart chrome. */
export function CollectionPriorityLists({ atRisk, pending, showConsultant = false }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const rows = toRows(atRisk, pending);
  const counts = Object.fromEntries(
    PRIORITY_STATES.map((state) => [state, rows.filter((row) => row.status === state).length]),
  ) as Record<PriorityState, number>;
  const filtered = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
  const visible = filtered.slice(0, VISIBLE_ROWS);
  const hidden = filtered.length - visible.length;

  return (
    <section
      aria-labelledby="priority-heading"
      className="flex min-w-0 flex-col rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 px-4 pt-5 sm:px-5 sm:pt-6">
        <div>
          <h3 id="priority-heading" className="text-[15px] font-semibold text-(--lifeops-fg)">
            Prioridad de cobranza
          </h3>
          <p className="mt-0.5 text-sm text-(--lifeops-muted)">
            Pólizas en peligro (más de {POLICY_AT_RISK_DAYS} días de atraso), vencidas y por vencer en los
            próximos {PENDING_PAYMENT_WITHIN_DAYS} días.
          </p>
        </div>
        <Link
          href="/dashboard/collections"
          className="inline-flex items-center gap-1 rounded text-sm text-(--lifeops-accent) underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
        >
          Ir a cobranza
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </header>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-(--lifeops-fg) sm:px-5">
          <CircleCheck className="h-4 w-4 shrink-0" style={{ color: 'var(--viz-current)' }} aria-hidden />
          Nada pendiente: ninguna póliza en peligro, vencida ni por vencer.
        </p>
      ) : (
        <>
          {/* Share of each state (counts are in the chips) */}
          <div className="mx-5 mt-4 flex h-2 gap-[2px] sm:mx-5" aria-hidden>
            {PRIORITY_STATES.map((state) =>
              counts[state] ? (
                <div
                  key={state}
                  className="first:rounded-l-full last:rounded-r-full"
                  style={{ flexGrow: counts[state], flexBasis: 0, background: CARTERA_STATUS[state].color }}
                />
              ) : null,
            )}
          </div>

          <FilterChips
            label="Filtrar prioridad por estado"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'Todas', count: rows.length },
              ...PRIORITY_STATES.map((state) => ({
                value: state,
                label: CARTERA_STATUS[state].label,
                color: CARTERA_STATUS[state].color,
                count: counts[state],
              })),
            ]}
            className="px-4 pt-4 pb-4 sm:px-5"
          />

          {visible.length === 0 ? (
            <p className="border-t border-(--lifeops-border) px-4 py-6 text-center text-sm text-(--lifeops-muted) sm:px-5">
              No hay pólizas en este estado.
            </p>
          ) : (
            <ul className="divide-y divide-(--lifeops-border) border-t border-(--lifeops-border)">
              {visible.map((row) => (
                <li key={row.contractId}>
                  <Link
                    href={row.href}
                    className="group grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 hover:bg-(--lifeops-hover) focus-visible:bg-(--lifeops-hover) focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto] sm:px-5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-(--lifeops-fg)">{row.contractNumber}</p>
                      <p className="truncate text-sm text-(--lifeops-muted)">
                        {row.clientName}
                        {showConsultant && row.consultantName ? ` · ${row.consultantName}` : ''}
                      </p>
                    </div>
                    <CarteraStatusBadge status={row.status} className="justify-self-end sm:justify-self-start" />
                    <p className="col-span-2 text-sm text-(--lifeops-muted) sm:col-span-1">
                      <span className="tabular-nums text-(--lifeops-fg)">{timing(row.daysPastDue)}</span>
                      <span className="sm:hidden"> · </span>
                      <span className="sm:block">{formatDateShortEsLocal(row.dueDate)}</span>
                    </p>
                    <ChevronRight
                      className="hidden h-4 w-4 text-(--lifeops-muted) transition-transform group-hover:translate-x-0.5 sm:block"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {hidden > 0 ? (
            <Link
              href="/dashboard/collections"
              className="border-t border-(--lifeops-border) px-4 py-3 text-center text-sm text-(--lifeops-accent) hover:bg-(--lifeops-hover) focus-visible:bg-(--lifeops-hover) focus-visible:outline-none sm:px-5"
            >
              Ver {hidden} más en cobranza
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
