'use client';

import Link from 'next/link';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
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
        <div className="flex items-end justify-between gap-2 flex-wrap">
          <div>
            <h2
              id="at-risk-heading"
              className="text-xl font-semibold text-[#FBDBAC]"
            >
              En peligro
            </h2>
            <p className="text-sm text-[#9ca3af]">
              Sin pago registrado más de {POLICY_AT_RISK_DAYS} días después de
              la fecha de cobro.
            </p>
          </div>
          <span className="text-sm text-white/70">{atRisk.length} póliza(s)</span>
        </div>
        {atRisk.length === 0 ? (
          <p className="rounded-lg border border-white/15 px-4 py-6 text-[#9ca3af] text-center">
            Ninguna póliza en peligro por ahora.
          </p>
        ) : (
          <ul className="rounded-lg border border-red-500/40 divide-y divide-white/10 overflow-hidden">
            {atRisk.slice(0, 10).map((row) => (
              <li key={row.contract_id}>
                <Link
                  href={`/dashboard/contracts/${row.contract_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-white/5"
                >
                  <div>
                    <p className="text-white font-medium">
                      {row.contract_number || 'Sin número'}
                    </p>
                    <p className="text-sm text-[#9ca3af]">
                      {row.client_name || 'Cliente sin nombre'}
                      {showConsultant && row.consultant_name
                        ? ` · ${row.consultant_name}`
                        : ''}
                    </p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="text-red-300 font-medium">
                      {row.days_overdue} días de atraso
                    </p>
                    <p className="text-[#9ca3af]">
                      Cobro: {formatDateShortEsLocal(row.due_date)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {atRisk.length > 10 && (
          <p className="text-sm text-[#9ca3af] text-center">
            Y {atRisk.length - 10} más — véalas en{' '}
            <Link
              href="/dashboard/collections"
              className="text-[#FBDBAC] underline"
            >
              cobranza
            </Link>
            .
          </p>
        )}
      </section>

      <section aria-labelledby="pending-heading" className="space-y-3">
        <div className="flex items-end justify-between gap-2 flex-wrap">
          <div>
            <h2
              id="pending-heading"
              className="text-xl font-semibold text-[#FBDBAC]"
            >
              Pagos por registrar
            </h2>
            <p className="text-sm text-[#9ca3af]">
              Mes actual sin pago, con fecha de cobro próxima
            </p>
          </div>
          <span className="text-sm text-white/70">{pending.length} póliza(s)</span>
        </div>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-white/15 px-4 py-6 text-[#9ca3af] text-center">
            No hay pagos pendientes en esta ventana.
          </p>
        ) : (
          <ul className="rounded-lg border border-white/20 divide-y divide-white/10 overflow-hidden">
            {pending.slice(0, 10).map((row) => (
              <li key={row.contract_id}>
                <Link
                  href="/dashboard/collections"
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-white/5"
                >
                  <div>
                    <p className="text-white font-medium">
                      {row.contract_number || 'Sin número'}
                    </p>
                    <p className="text-sm text-[#9ca3af]">
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
                          ? 'text-amber-300 font-medium'
                          : 'text-white/90'
                      }
                    >
                      {row.is_overdue
                        ? `Vencida hace ${Math.abs(row.days_until_due)} día(s)`
                        : `En ${row.days_until_due} día(s)`}
                    </p>
                    <p className="text-[#9ca3af]">
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
