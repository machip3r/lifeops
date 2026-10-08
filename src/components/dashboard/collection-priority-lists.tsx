'use client';

import Link from 'next/link';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import {
  PENDING_PAYMENT_WITHIN_DAYS,
  POLICY_AT_RISK_DAYS,
} from '@/lib/collections/constants';
import { formatDateShortEsLocal } from '@/lib/format/date';

type Props = {
  atRisk: ContractAtRisk[];
  pending: ContractPendingPayment[];
  /** Show consultant name (office-wide views). */
  showConsultant?: boolean;
};

export function CollectionPriorityLists({
  atRisk,
  pending,
  showConsultant = false,
}: Props) {
  return (
    <div className="space-y-8">
      <section aria-labelledby="at-risk-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="at-risk-heading"
              className="text-xl font-semibold text-(--lifeops-accent)"
            >
              En peligro
            </h2>
            <p className="text-sm text-(--lifeops-muted)">
              Sin pago registrado más de {POLICY_AT_RISK_DAYS} días después de
              la fecha de cobro.
            </p>
          </div>
          <span className="text-sm text-(--lifeops-muted)">
            {atRisk.length} póliza(s)
          </span>
        </div>
        {atRisk.length === 0 ? (
          <p className="rounded-lg border border-(--lifeops-border) px-4 py-6 text-center text-(--lifeops-muted)">
            Ninguna póliza en peligro por ahora.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-red-500/40 divide-y divide-(--lifeops-border)">
            {atRisk.slice(0, 10).map((row) => (
              <li key={row.contract_id}>
                <Link
                  href={`/dashboard/contracts/${row.contract_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-(--lifeops-hover)"
                >
                  <div>
                    <p className="font-medium text-(--lifeops-fg)">
                      {row.contract_number || 'Sin número'}
                    </p>
                    <p className="text-sm text-(--lifeops-muted)">
                      {row.client_name || 'Cliente sin nombre'}
                      {showConsultant && row.consultant_name
                        ? ` · ${row.consultant_name}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-medium text-red-500 dark:text-red-300">
                      {row.days_overdue} días de atraso
                    </p>
                    <p className="text-(--lifeops-muted)">
                      Cobro: {formatDateShortEsLocal(row.due_date)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {atRisk.length > 10 && (
          <p className="text-center text-sm text-(--lifeops-muted)">
            Y {atRisk.length - 10} más — véalas en{' '}
            <Link
              href="/dashboard/collections"
              className="text-(--lifeops-accent) underline"
            >
              cobranza
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-labelledby="pending-heading" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2
              id="pending-heading"
              className="text-xl font-semibold text-(--lifeops-accent)"
            >
              Pagos por registrar
            </h2>
            <p className="text-sm text-(--lifeops-muted)">
              Próximo cobro en los próximos {PENDING_PAYMENT_WITHIN_DAYS} días
              (o recién vencido)
            </p>
          </div>
          <span className="text-sm text-(--lifeops-muted)">
            {pending.length} póliza(s)
          </span>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-(--lifeops-border) px-4 py-6 text-center text-(--lifeops-muted)">
            No hay pagos pendientes en esta ventana.
          </p>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-(--lifeops-border) divide-y divide-(--lifeops-border)">
            {pending.slice(0, 10).map((row) => (
              <li key={row.contract_id}>
                <Link
                  href="/dashboard/collections"
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-(--lifeops-hover)"
                >
                  <div>
                    <p className="font-medium text-(--lifeops-fg)">
                      {row.contract_number || 'Sin número'}
                    </p>
                    <p className="text-sm text-(--lifeops-muted)">
                      {row.client_name || 'Cliente sin nombre'}
                      {showConsultant && row.consultant_name
                        ? ` · ${row.consultant_name}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p
                      className={
                        row.is_overdue
                          ? 'font-medium text-amber-600 dark:text-amber-300'
                          : 'text-(--lifeops-fg)'
                      }
                    >
                      {row.is_overdue
                        ? `Vencida hace ${Math.abs(row.days_until_due)} día(s)`
                        : `En ${row.days_until_due} día(s)`}
                    </p>
                    <p className="text-(--lifeops-muted)">
                      Cobro: {formatDateShortEsLocal(row.due_date)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
