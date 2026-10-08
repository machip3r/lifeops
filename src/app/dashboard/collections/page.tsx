'use client';

import { useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import {
  RegisterPaymentDialog,
  type RegisterPaymentTarget,
} from '@/components/collections/register-payment-dialog';
import {
  AtRiskBadge,
  OverdueBadge,
  daysPastDue,
} from '@/components/collections/at-risk-badge';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import { ListSearchFilters } from '@/components/list-search-filters';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';

type SortKey =
  | 'contract_number'
  | 'client_name'
  | 'nextDue'
  | 'payment_method'
  | 'premium_payment';

const TH = 'px-4 py-3 text-(--lifeops-muted)';
const ACTIONS_TH =
  'px-4 py-3 text-right text-xs font-medium text-(--lifeops-muted) uppercase tracking-wider sticky right-0 bg-(--lifeops-hover) z-10';
const ACTIONS_TD =
  'px-4 py-3 whitespace-nowrap text-right sticky right-0 bg-(--lifeops-chrome) z-10';

type ScheduleRow = {
  contract_id: string;
  contract_number: string | null;
  client_name: string | null;
  payment_method: string | null;
  collection_day: number | null;
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
  const [loading, setLoading] = useQueryLoading(profile?.id ?? '');
  /** month = next due in current calendar month; upcoming = from start of month forward */
  const [rangeMode, setRangeMode] = useState<'month' | 'upcoming'>('upcoming');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey | null>('nextDue');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [paymentTarget, setPaymentTarget] =
    useState<RegisterPaymentTarget | null>(null);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useResetPage(`${rangeMode}\0${search}`);

  const loadSchedule = useCallback(async () => {
    if (!profile?.id) return;
    try {
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
          collection_day: r.collection_day,
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
  }, [profile, setLoading]);

  useQueryEffect(Boolean(profile), loadSchedule);

  const filtered = useMemo(() => {
    const monthStart = startOfMonthLocal();
    const monthEnd = endOfMonthLocal();
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (!r.nextDue) return false;
      const t = r.nextDue.getTime();
      if (rangeMode === 'month') {
        if (t < monthStart.getTime() || t > monthEnd.getTime()) return false;
      } else if (t < monthStart.getTime()) {
        return false;
      }
      if (!q) return true;
      const hay = `${r.contract_number ?? ''} ${r.client_name ?? ''} ${r.payment_method ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [rows, rangeMode, search]);

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
        <p className="text-(--lifeops-muted)">Cargando…</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Cobranza"
        watermark="Cobranza"
        description="Próximos cobros según el último pago conocido. Registra el pago con evidencia para avanzar la fecha."
      />

      <div className="overflow-hidden rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) shadow-lg">
        <ListSearchFilters
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={() => {
            setSearch(searchDraft);
            setPage(1);
          }}
          placeholder="Póliza, cliente o forma de pago…"
          id="collections-search"
          extras={
            <label className="flex min-w-[12rem] flex-col gap-1 text-sm text-(--lifeops-muted)">
              <span className="sr-only">Mostrar</span>
              <select
                value={rangeMode}
                onChange={(e) => {
                  setRangeMode(e.target.value === 'month' ? 'month' : 'upcoming');
                }}
                className="h-12 rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-page) px-3 text-(--lifeops-fg) focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
                aria-label="Periodo de cobranza"
              >
                <option value="upcoming">Desde este mes en adelante</option>
                <option value="month">Solo este mes</option>
              </select>
            </label>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center px-6 py-12">
            <p className="text-(--lifeops-muted)">Cargando cobranza…</p>
          </div>
        ) : total === 0 ? (
          <div className="flex items-center justify-center px-6 py-12 text-center">
            <p className="text-(--lifeops-muted)">
              {search.trim()
                ? 'No hay cobros que coincidan con la búsqueda.'
                : 'No hay cobros pendientes en el periodo seleccionado.'}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-(--lifeops-border)">
                <thead className="bg-(--lifeops-hover)">
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
                      className={`${TH} hidden sm:table-cell`}
                    />
                    <SortableTh
                      label="Monto"
                      active={sortKey === 'premium_payment'}
                      dir={sortDir}
                      onSort={() => toggleSort('premium_payment')}
                      className={`${TH} text-right`}
                    />
                    <th className={ACTIONS_TH}>Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--lifeops-border)">
                  {pageRows.map((row) => (
                    <tr
                      key={row.contract_id}
                      className="hover:bg-(--lifeops-hover)/70"
                    >
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/dashboard/contracts/${row.contract_id}`}
                            className="text-sm font-medium text-(--lifeops-accent) hover:underline"
                          >
                            {row.contract_number || '—'}
                          </Link>
                          {(() => {
                            const past = daysPastDue(row.nextDue);
                            if (past == null || past <= 0) return null;
                            if (past > POLICY_AT_RISK_DAYS) {
                              return <AtRiskBadge daysOverdue={past} />;
                            }
                            return <OverdueBadge />;
                          })()}
                        </div>
                      </td>
                      <td className="max-w-[10rem] truncate px-4 py-3 text-sm text-(--lifeops-fg) sm:max-w-none sm:whitespace-nowrap">
                        {row.client_name || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-(--lifeops-fg)">
                        {row.nextDue ? formatDateShortEsLocal(row.nextDue) : '—'}
                      </td>
                      <td className="hidden whitespace-nowrap px-4 py-3 text-sm text-(--lifeops-muted) sm:table-cell">
                        {row.payment_method || '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-medium text-(--lifeops-fg)">
                        {`$${Number(row.premium_payment).toLocaleString('es-MX', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}`}
                      </td>
                      <td className={ACTIONS_TD}>
                        <Button
                          type="button"
                          variant="brand"
                          size="sm"
                          className="w-full sm:w-auto"
                          onClick={() =>
                            setPaymentTarget({
                              contractId: row.contract_id,
                              contractNumber: row.contract_number,
                              clientName: row.client_name,
                              nextDue: row.nextDue,
                              suggestedAmount: row.premium_payment,
                              collectionDay: row.collection_day,
                            })
                          }
                        >
                          <span className="sm:hidden">Pago</span>
                          <span className="hidden sm:inline">Registrar pago</span>
                        </Button>
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
          </>
        )}
      </div>

      <RegisterPaymentDialog
        open={paymentTarget != null}
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={async () => {
          setLoading(true);
          await loadSchedule();
        }}
      />
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
