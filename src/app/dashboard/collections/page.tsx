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

type ScheduleRow = {
  contract_id: string;
  contract_number: string | null;
  client_name: string | null;
  payment_method: string | null;
  last_paid_at: string | null;
  premium_payment: number;
  nextDue: Date | null;
};

function startOfMonthLocal(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonthLocal(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function CollectionsPageContent() {
  const { profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<ScheduleRow[]>([]);
  const [loading, setLoading] = useState(true);
  /** month = next due in current calendar month; upcoming = from start of month forward */
  const [rangeMode, setRangeMode] = useState<'month' | 'upcoming'>('upcoming');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey | null>('nextDue');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadSchedule = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const data = await db.collections.listScheduleRows({
        officeId: profile.role === 'promotory' ? profile.id : undefined,
        consultantId: profile.role === 'consultant' ? profile.id : undefined,
      });
      setRows(
        data.map((r) => ({
          contract_id: r.contract_id,
          contract_number: r.contract_number,
          client_name: r.client_name,
          payment_method: r.payment_method,
          last_paid_at: r.last_paid_at,
          premium_payment: r.premium_payment,
          nextDue: r.next_due,
        })),
      );
    } catch (error) {
      console.error('Error loading collections data:', error);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile) void loadSchedule();
  }, [profile, loadSchedule]);

  useEffect(() => {
    setPage(1);
  }, [rangeMode]);

  const filtered = useMemo(() => {
    const monthStart = startOfMonthLocal();
    const monthEnd = endOfMonthLocal();
    return rows.filter((r) => {
      if (!r.nextDue) return false;
      const t = r.nextDue.getTime();
      if (rangeMode === 'month') {
        return t >= monthStart.getTime() && t <= monthEnd.getTime();
      }
      // Hide stale next-dues from old commission files when last payment is current.
      return t >= monthStart.getTime();
    });
  }, [rows, rangeMode]);

  const sortedItems = useMemo(
    () =>
      sortRows(
        filtered,
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
    [filtered, sortKey, sortDir],
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
          Próximos cobros según el último pago conocido (alta / import) y la forma
          de pago — no solo la fecha vieja del archivo de comisiones.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-3">
        <label className="text-sm text-[#9ca3af] flex items-center gap-2">
          <span>Mostrar</span>
          <select
            value={rangeMode}
            onChange={(e) => {
              setRangeMode(e.target.value === 'month' ? 'month' : 'upcoming');
            }}
            className="rounded-md border border-[#3a4049] bg-[#242830] text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
          >
            <option value="upcoming">Desde este mes en adelante</option>
            <option value="month">Solo este mes</option>
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
            No hay cobros pendientes en el periodo seleccionado.
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
