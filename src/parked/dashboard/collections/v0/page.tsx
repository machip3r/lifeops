'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { addMonths, parseISO } from 'date-fns';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Link from 'next/link';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type SortKey = 'contract_number' | 'client_name' | 'nextDue' | 'payment_method' | 'premium_payment';
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

function getNextDueDate(paymentDate: string | null, paymentMethod: string | null): Date | null {
  if (!paymentDate) return null;
  const months = paymentMethod
    ? FORMA_PAGO_MONTHS[paymentMethod.trim()] ?? FORMA_PAGO_MONTHS['Mensual']
    : FORMA_PAGO_MONTHS['Mensual'];
  try {
    const d = typeof paymentDate === 'string' ? parseISO(paymentDate) : paymentDate;
    return addMonths(d, months);
  } catch {
    return null;
  }
}

export default function CollectionsPage() {
  const { profile, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<DetailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dueByEndOfMonth, setDueByEndOfMonth] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const loadDetails = useCallback(async () => {
    try {
      setLoading(true);
      const result = await db.contractDetail.getDetailsWithContractAndClientPage({
        page,
        pageSize,
        dueByEndOfMonth: dueByEndOfMonth || undefined,
      });
      setDetails(result.rows as DetailRow[]);
      setTotal(result.total);
    } catch (error) {
      console.error('Error loading collections data:', error);
      setDetails([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, dueByEndOfMonth]);

  useEffect(() => {
    if (profile) loadDetails();
  }, [profile, loadDetails]);

  const dueItems = useMemo(
    () =>
      details.map((row) => ({
        row,
        nextDue: getNextDueDate(row.payment_date, row.payment_method),
      })),
    [details],
  );

  const totalDue = useMemo(
    () => dueItems.reduce((sum, { row }) => sum + (row.premium_payment ?? 0), 0),
    [dueItems],
  );

  const sortedDueItems = useMemo(
    () =>
      sortRows(
        dueItems,
        sortKey,
        sortDir,
        {
          contract_number: (i) => i.row.contract_number,
          client_name: (i) => i.row.client_name,
          nextDue: (i) => i.nextDue,
          payment_method: (i) => i.row.payment_method,
          premium_payment: (i) => i.row.premium_payment,
        },
        {
          nextDue: 'date',
          premium_payment: 'number',
        },
      ),
    [dueItems, sortKey, sortDir],
  );

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">Cobranza</h1>
        <p className="text-[#9ca3af] mt-1">
          Pólizas, clientes y fechas con pagos por vencer y monto a cobrar
        </p>
        <p className="text-xs text-[#6b7280] mt-2">
          Vista anterior (v0).{' '}
          <Link href="/dashboard/collections" className="text-[#FBDBAC] hover:underline">
            Ir a cobranza actual
          </Link>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row sm:justify-end sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label className="text-sm text-[#9ca3af]">Mostrar vencimientos hasta:</label>
          <select
            value={dueByEndOfMonth ? 'month' : 'next'}
            onChange={(e) => {
              setPage(1);
              setDueByEndOfMonth(e.target.value === 'month');
            }}
            className="rounded-md border border-[#3a4049] bg-[#242830] text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
          >
            <option value="month">Fin del mes actual</option>
            <option value="next">Todos (sin filtro de mes)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <p className="text-[#9ca3af]">Cargando cobranza...</p>
        </div>
      ) : total === 0 ? (
        <div className="rounded-lg border border-[#2a2f38] bg-[#242830] p-8 text-center">
          <p className="text-[#9ca3af]">
            No hay pagos pendientes en el periodo seleccionado.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-[#2a2f38] bg-[#242830] p-4">
            <p className="text-sm text-[#9ca3af]">
              Total a cobrar en esta página ({dueItems.length}{' '}
              {dueItems.length === 1 ? 'registro' : 'registros'} · {total.toLocaleString('es-MX')}{' '}
              en total):{' '}
              <span className="font-semibold text-white">
                ${totalDue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </p>
          </div>
          <div className="rounded-lg border border-[#2a2f38] bg-[#242830] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-[#2a2f38]">
                <thead className="bg-[#2a2f38]">
                  <tr>
                    <SortableTh label="Póliza" active={sortKey === 'contract_number'} dir={sortDir} onSort={() => toggleSort('contract_number')} className={TH} />
                    <SortableTh label="Cliente" active={sortKey === 'client_name'} dir={sortDir} onSort={() => toggleSort('client_name')} className={TH} />
                    <SortableTh label="Fecha de pago (vencimiento)" active={sortKey === 'nextDue'} dir={sortDir} onSort={() => toggleSort('nextDue')} className={TH} />
                    <SortableTh label="Forma de pago" active={sortKey === 'payment_method'} dir={sortDir} onSort={() => toggleSort('payment_method')} className={TH} />
                    <SortableTh label="Monto" active={sortKey === 'premium_payment'} dir={sortDir} onSort={() => toggleSort('premium_payment')} className={`${TH} text-right`} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a2f38]">
                  {sortedDueItems.map(({ row, nextDue }) => (
                    <tr key={`${row.id}-${row.payment_date}`} className="hover:bg-[#2a2f38]/50">
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
                        {nextDue ? format(nextDue, 'd MMM yyyy', { locale: es }) : '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-[#9ca3af]">
                        {row.payment_method || '—'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-white">
                        {row.premium_payment != null
                          ? `$${Number(row.premium_payment).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : '—'}
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
        </>
      )}
    </div>
  );
}
