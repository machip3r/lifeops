'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';

type SortKey =
  | 'contract_number'
  | 'client_name'
  | 'nextDue'
  | 'payment_method'
  | 'premium_payment';

const TH = 'px-4 py-3 text-[#9ca3af]';

const FORMA_PAGO_MONTHS: Record<string, number> = {
  Mensual: 1,
  Trimestral: 3,
  Semestral: 6,
  Anual: 12,
};

type DetailRow = {
  id: string;
  contract_id: string;
  payment_date: string | null;
  premium_payment: number | null;
  payment_method: string | null;
  contract_number?: string | null;
  client_name?: string | null;
};

type AggregatedDue = {
  contract_id: string;
  contract_number: string | null;
  client_name: string | null;
  payment_method: string | null;
  payment_date: string | null;
  premium_payment: number;
  nextDue: Date | null;
};

function addMonthsLocal(date: Date, months: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setMonth(d.getMonth() + months);
  return d;
}

function parseIsoLocal(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [y, m, day] = value.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, day);
}

function getNextDueDate(
  paymentDate: string | null,
  paymentMethod: string | null,
): Date | null {
  if (!paymentDate) return null;
  const months = paymentMethod
    ? (FORMA_PAGO_MONTHS[paymentMethod.trim()] ?? FORMA_PAGO_MONTHS.Mensual)
    : FORMA_PAGO_MONTHS.Mensual;
  const base = parseIsoLocal(paymentDate);
  if (!base) return null;
  return addMonthsLocal(base, months);
}

/** One row per póliza: sum montos from commission detail lines. */
function aggregateByContract(details: DetailRow[]): AggregatedDue[] {
  const byContract = new Map<string, AggregatedDue>();

  for (const row of details) {
    const existing = byContract.get(row.contract_id);
    const amount = row.premium_payment ?? 0;
    if (!existing) {
      byContract.set(row.contract_id, {
        contract_id: row.contract_id,
        contract_number: row.contract_number ?? null,
        client_name: row.client_name ?? null,
        payment_method: row.payment_method,
        payment_date: row.payment_date,
        premium_payment: amount,
        nextDue: getNextDueDate(row.payment_date, row.payment_method),
      });
      continue;
    }

    existing.premium_payment += amount;
    // Prefer the most recent payment_date for next-due / forma de pago.
    if (
      row.payment_date &&
      (!existing.payment_date || row.payment_date > existing.payment_date)
    ) {
      existing.payment_date = row.payment_date;
      existing.payment_method = row.payment_method;
      existing.nextDue = getNextDueDate(row.payment_date, row.payment_method);
    }
    if (!existing.client_name && row.client_name) {
      existing.client_name = row.client_name;
    }
    if (!existing.contract_number && row.contract_number) {
      existing.contract_number = row.contract_number;
    }
  }

  return Array.from(byContract.values());
}

function CollectionsPageContent() {
  const { profile, loading: authLoading } = useAuth();
  const [aggregated, setAggregated] = useState<AggregatedDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [dueByEndOfMonth, setDueByEndOfMonth] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey | null>('nextDue');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      // Fetch a large page so we can aggregate by póliza before paginating.
      const result = await db.contractDetail.getDetailsWithContractAndClientPage({
        page: 1,
        pageSize: 5000,
        dueByEndOfMonth: dueByEndOfMonth || undefined,
      });
      setAggregated(aggregateByContract(result.rows as DetailRow[]));
    } catch (error) {
      console.error('Error loading collections data:', error);
      setAggregated([]);
    } finally {
      setLoading(false);
    }
  }, [dueByEndOfMonth]);

  useEffect(() => {
    if (profile) void loadDetails();
  }, [profile, loadDetails]);

  useEffect(() => {
    setPage(1);
  }, [dueByEndOfMonth, aggregated.length]);

  const sortedItems = useMemo(
    () =>
      sortRows(
        aggregated,
        sortKey,
        sortDir,
        {
          contract_number: (i) => i.contract_number,
          client_name: (i) => i.client_name,
          nextDue: (i) => i.nextDue,
          payment_method: (i) => i.payment_method,
          premium_payment: (i) => i.premium_payment,
        },
        {
          nextDue: 'date',
          premium_payment: 'number',
        },
      ),
    [aggregated, sortKey, sortDir],
  );

  const total = sortedItems.length;
  const pageRows = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedItems.slice(from, from + pageSize);
  }, [sortedItems, page, pageSize]);

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando…</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">Cobranza</h1>
        <p className="text-[#9ca3af] mt-1 max-w-xl mx-auto">
          Próximos cobros ordenados por fecha. Revisa póliza, cliente, vencimiento
          y monto a cobrar.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3">
        <label className="text-sm text-[#9ca3af] flex items-center gap-2">
          <span>Vencimientos</span>
          <select
            value={dueByEndOfMonth ? 'month' : 'next'}
            onChange={(e) => {
              setDueByEndOfMonth(e.target.value === 'month');
            }}
            className="rounded-md border border-[#3a4049] bg-[#242830] text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
          >
            <option value="month">Hasta fin de este mes</option>
            <option value="next">Todos</option>
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <p className="text-[#9ca3af]">Cargando cobranza…</p>
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-[#2a2f38] bg-[#242830] p-8 text-center">
          <p className="text-[#9ca3af]">
            No hay pagos pendientes en el periodo seleccionado.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2f38] bg-[#242830] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#2a2f38]">
              <thead className="bg-[#2a2f38]">
                <tr>
                  <SortableTh
                    label="Póliza"
                    active={sortKey === 'contract_number'}
                    dir={sortDir}
                    onSort={() => toggleSort('contract_number')}
                    className={TH}
                  />
                  <SortableTh
                    label="Cliente"
                    active={sortKey === 'client_name'}
                    dir={sortDir}
                    onSort={() => toggleSort('client_name')}
                    className={TH}
                  />
                  <SortableTh
                    label="Fecha de cobro"
                    active={sortKey === 'nextDue'}
                    dir={sortDir}
                    onSort={() => toggleSort('nextDue')}
                    className={TH}
                  />
                  <SortableTh
                    label="Forma de pago"
                    active={sortKey === 'payment_method'}
                    dir={sortDir}
                    onSort={() => toggleSort('payment_method')}
                    className={TH}
                  />
                  <SortableTh
                    label="Monto"
                    active={sortKey === 'premium_payment'}
                    dir={sortDir}
                    onSort={() => toggleSort('premium_payment')}
                    className={`${TH} text-right`}
                  />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2f38]">
                {pageRows.map((row) => (
                  <tr
                    key={row.contract_id}
                    className="hover:bg-[#2a2f38]/50"
                  >
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/dashboard/contracts/${row.contract_id}`}
                        className="text-sm font-medium text-[#FBDBAC] hover:underline"
                      >
                        {row.contract_number || '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white">
                      {row.client_name || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-[#e5e7eb]">
                      {row.nextDue ? formatDateShortEsLocal(row.nextDue) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-[#9ca3af]">
                      {row.payment_method || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-white">
                      {`$${Number(row.premium_payment).toLocaleString('es-MX', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <CollectionsPageContent />
    </ProtectedRoute>
  );
}
