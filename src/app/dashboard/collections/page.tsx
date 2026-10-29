'use client';

import { useState, useCallback, useMemo } from 'react';
import { CalendarCheck2, CalendarClock, CalendarRange, HandCoins, Siren } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import type { Client, CollectionBoard, CollectionBoardRow } from '@/lib/supabase';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { useToast } from '@/components/toast';
import { DataTable, dataTablePanelClass, type DataTableColumn } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import {
  RegisterPaymentDialog,
  type RegisterPaymentTarget,
} from '@/components/collections/register-payment-dialog';
import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { ReceiptPanel, dueLabel } from '@/components/collections/receipt-panel';
import { MissingPaymentMethodFlag } from '@/components/contracts/missing-payment-method';
import { CollectionAgingCard } from '@/components/collections/collection-aging-card';
import { ConsultantPicker } from '@/components/collections/consultant-picker';
import { FilterChips } from '@/components/ui/filter-chips';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { CARTERA_STATUS } from '@/lib/collections/status';
import { receiptPosition } from '@/lib/collections/next-due';
import { formatAmount } from '@/lib/contracts/currencies';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal, isoToLocalDate } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import { GettingStarted } from '@/components/dashboard/getting-started';
import { EmptyState } from '@/components/ui/empty-state';
import { useContractCount } from '@/hooks/use-contract-count';
import { ListSearchFilters } from '@/components/list-search-filters';
import { cn } from '@/lib/utils';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';
import { StatTilesSkeleton, TableSkeleton } from '@/components/ui/skeleton';
import { ListPageSkeleton } from '@/components/ui/skeleton';

type SortKey = 'contract_number' | 'client_name' | 'next_due' | 'amount';

/** Period tabs. "Por cobrar" = en peligro + vencidas + por vencer (same as the dashboard lists). */
type Period = 'pending' | 'today' | 'at_risk' | 'overdue' | 'due_soon' | 'current' | 'all';

const PERIODS: Array<{ value: Period; label: string; color?: string }> = [
  { value: 'pending', label: 'Por cobrar' },
  { value: 'today', label: 'Vencen hoy', color: CARTERA_STATUS.due_soon.color },
  { value: 'at_risk', ...CARTERA_STATUS.at_risk },
  { value: 'overdue', ...CARTERA_STATUS.overdue },
  { value: 'due_soon', ...CARTERA_STATUS.due_soon },
  { value: 'current', ...CARTERA_STATUS.current },
  { value: 'all', label: 'Todas' },
];

function inPeriod(row: CollectionBoardRow, period: Period): boolean {
  switch (period) {
    case 'all':
      return true;
    case 'pending':
      return row.cartera_status === 'at_risk' || row.cartera_status === 'overdue' || row.cartera_status === 'due_soon';
    case 'today':
      return row.days_past_due === 0;
    default:
      return row.cartera_status === period;
  }
}

function monthEndIso(today: string): string {
  const [y, m] = today.split('-').map(Number);
  const end = new Date(y, m, 0);
  return `${y}-${String(m).padStart(2, '0')}-${String(end.getDate()).padStart(2, '0')}`;
}

function CollectionsPageContent() {
  const { profile, loading: authLoading } = useAuth();
  const officeView = profile?.role === 'promotory';
  const [board, setBoard] = useState<CollectionBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useQueryLoading(profile?.id ?? '');
  const [period, setPeriod] = useState<Period>('pending');
  const [consultantId, setConsultantId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [sortKey, setSortKey] = useState<SortKey | null>('next_due');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [paymentTarget, setPaymentTarget] = useState<RegisterPaymentTarget | null>(null);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const { toast } = useToast();
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const cartera = useContractCount(
    officeView ? { officeId: profile?.id } : { consultantId: profile?.id },
    !authLoading && Boolean(profile),
  );
  const [page, setPage] = useResetPage(`${period}\0${search}\0${consultantId ?? ''}\0${pageSize}`);

  const loadBoard = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await db.collections.listBoard({
        officeId: profile.role === 'promotory' ? profile.id : undefined,
        consultantId: profile.role === 'consultant' ? profile.id : undefined,
        riskDays: POLICY_AT_RISK_DAYS,
        dueSoonDays: PENDING_PAYMENT_WITHIN_DAYS,
      });
      setBoard(data);
      setError(null);
    } catch (e) {
      console.error('Error loading collections board:', e);
      setError('No se pudo cargar la cobranza.');
    } finally {
      setLoading(false);
    }
  }, [profile, setLoading]);

  useQueryEffect(Boolean(profile), loadBoard);

  const rows = useMemo(() => board?.rows ?? [], [board]);

  // Search applies before the asesor + period filters (their counts follow it)
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      `${r.contract_number ?? ''} ${r.client_name ?? ''} ${r.consultant_name ?? ''} ${r.payment_method ?? ''}`
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const byConsultant = useMemo(
    () => (consultantId ? searched.filter((r) => r.consultant_id === consultantId) : searched),
    [searched, consultantId],
  );

  const periodOptions = PERIODS.map((p) => ({
    ...p,
    count: byConsultant.filter((r) => inPeriod(r, p.value)).length,
  }));

  const consultants = useMemo(() => {
    const map = new Map<string, { id: string; name: string; count: number; atRisk: number }>();
    for (const r of searched) {
      const entry = map.get(r.consultant_id) ?? { id: r.consultant_id, name: r.consultant_name ?? 'Asesor', count: 0, atRisk: 0 };
      if (inPeriod(r, period)) entry.count += 1;
      if (r.cartera_status === 'at_risk') entry.atRisk += 1;
      map.set(r.consultant_id, entry);
    }
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
  }, [searched, period]);

  const filtered = useMemo(() => byConsultant.filter((r) => inPeriod(r, period)), [byConsultant, period]);

  const sortedItems = useMemo(
    () =>
      sortRows(
        filtered,
        sortKey,
        sortDir,
        {
          contract_number: (i) => i.contract_number,
          client_name: (i) => i.client_name,
          next_due: (i) => i.next_due,
          amount: (i) => i.amount,
        },
        { next_due: 'date', amount: 'number' },
      ),
    [filtered, sortKey, sortDir],
  );

  const pageRows = useMemo(() => {
    const from = (page - 1) * pageSize;
    return sortedItems.slice(from, from + pageSize);
  }, [sortedItems, page, pageSize]);

  const selected = rows.find((r) => r.contract_id === selectedId) ?? null;
  const selectedConsultant = consultants.find((c) => c.id === consultantId) ?? null;

  const counters = useMemo(() => {
    const today = board?.today ?? '';
    const monthEnd = today ? monthEndIso(today) : '';
    return {
      today: rows.filter((r) => r.days_past_due === 0).length,
      next7: rows.filter((r) => r.days_past_due != null && r.days_past_due <= 0 && r.days_past_due > -7).length,
      untilMonthEnd: rows.filter((r) => r.next_due && monthEnd && r.next_due <= monthEnd).length,
      late: rows.filter((r) => r.cartera_status === 'overdue' || r.cartera_status === 'at_risk').length,
      atRisk: rows.filter((r) => r.cartera_status === 'at_risk').length,
      monthEnd,
    };
  }, [rows, board?.today]);

  // Receipt panel → "Registra su número de teléfono": edit the client right here
  const openClientEdit = async (row: CollectionBoardRow) => {
    if (!row.client_id) return;
    try {
      const client = await db.client.getClientById(row.client_id);
      if (client) setEditingClient(client);
      else toast.error('No encontramos al cliente.');
    } catch (e) {
      console.error('Error loading client:', e);
      toast.error('No se pudo abrir al cliente.');
    }
  };

  const openPayment = (row: CollectionBoardRow) =>
    setPaymentTarget({
      contractId: row.contract_id,
      contractNumber: row.contract_number,
      clientName: row.client_name,
      nextDue: isoToLocalDate(row.next_due),
      suggestedAmount: row.amount,
      collectionDay: row.collection_day,
      currency: row.currency,
    });

  const sortFor = (key: SortKey, label: string) => ({
    label,
    active: sortKey === key,
    dir: sortDir,
    onSort: () => {
      const next = nextSortState(sortKey, sortDir, key);
      setSortKey(next.key);
      setSortDir(next.dir);
    },
  });

  const columns: DataTableColumn<CollectionBoardRow>[] = [
    {
      id: 'contract_number',
      header: 'Recibo',
      sort: sortFor('contract_number', 'Recibo'),
      cell: (row) => {
        const position = receiptPosition(row.issue_date, row.payment_method, isoToLocalDate(row.next_due));
        return (
          <div className="min-w-0 max-w-[16rem]">
            <p className="truncate">
              <span className="font-mono text-[13px] font-medium text-(--lifeops-accent)">
                {row.contract_number || 'Sin número'}
              </span>
              {position ? (
                <span className="ml-1.5 text-xs text-(--lifeops-muted)">
                  {position.number}/{position.perYear}
                </span>
              ) : null}
            </p>
            <p className="truncate text-xs text-(--lifeops-muted)">
              {row.client_name || 'Cliente sin nombre'}
              {officeView && !consultantId && row.consultant_name ? ` · ${row.consultant_name}` : ''}
            </p>
            {!row.payment_method?.trim() ? <MissingPaymentMethodFlag className="mt-0.5" /> : null}
          </div>
        );
      },
    },
    {
      id: 'next_due',
      header: 'Vence',
      className: 'tabular-nums',
      sort: sortFor('next_due', 'Vence'),
      cell: (row) => (row.next_due ? formatDateShortEsLocal(row.next_due) : '—'),
    },
    {
      id: 'days',
      header: 'Días',
      cell: (row) => (
        <span
          className={cn(
            'tabular-nums',
            (row.days_past_due ?? 0) > 0 ? 'text-(--lifeops-fg)' : 'text-(--lifeops-muted)',
          )}
        >
          {dueLabel(row.days_past_due)}
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Monto',
      align: 'right',
      className: 'tabular-nums',
      sort: sortFor('amount', 'Monto'),
      cell: (row) => formatAmount(row.amount, row.currency) ?? '—',
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (row) => <CarteraStatusBadge status={row.cartera_status} daysOverdue={row.days_past_due} />,
    },
  ];

  if (authLoading) {
    return (
      <ListPageSkeleton />
    );
  }

  if (!profile) return null;

  const showPicker = officeView && consultants.length > 1;
  const scopeTitle = selectedConsultant?.name ?? (officeView ? 'Toda la promotoría' : 'Tu cartera');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Cobranza"
        watermark="Cobranza"
        description="Recibos por cobrar según el calendario de cada póliza. Registra el pago con evidencia o manda un recordatorio al cliente."
      />

      {cartera.count === 0 ? (
        <GettingStarted
          context="collections"
          onRegistered={() => {
            void cartera.reload();
            setLoading(true);
            void loadBoard();
          }}
        />
      ) : board && board.rows.length === 0 && cartera.count != null ? (
        <EmptyState
          icon={CalendarCheck2}
          title="No hay pólizas en vigor por cobrar"
          description="Las pólizas que tienes están anuladas, prorrogadas o sin pago de primas, así que no generan recibos. Si rehabilitas una anulada desde su expediente, aparecerá aquí."
          actions={
            <Button asChild variant="brand">
              <Link href="/dashboard/contracts">Ver pólizas</Link>
            </Button>
          }
        />
      ) : (
        <>
          {board ? (
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <StatTile
                label="Vencen hoy"
                icon={CalendarClock}
                value={board ? numberEs.format(counters.today) : '—'}
                detail={board ? `${numberEs.format(counters.next7)} en los próximos 7 días` : undefined}
              />
              <StatTile
                label="Por cobrar al cierre"
                icon={CalendarRange}
                value={board ? numberEs.format(counters.untilMonthEnd) : '—'}
                detail={board ? `Recibos pendientes hasta el ${formatDateShortEsLocal(counters.monthEnd)}` : undefined}
              />
              <StatTile
                label="Vencidos"
                icon={Siren}
                value={board ? numberEs.format(counters.late) : '—'}
                detail={board ? `${numberEs.format(counters.atRisk)} en peligro (más de ${POLICY_AT_RISK_DAYS} días)` : undefined}
              />
              <StatTile
                label="Pagos este mes"
                icon={HandCoins}
                value={board ? numberEs.format(board.payments_month_to_date) : '—'}
                detail="Registrados en cobranza o en archivos"
              />
            </div>
          ) : (
            <StatTilesSkeleton />
          )}

          <FilterChips label="Periodo de cobro" options={periodOptions} value={period} onChange={setPeriod} />

          <div
            className={cn(
              'grid grid-cols-1 gap-4',
              showPicker ? 'xl:grid-cols-[15rem_minmax(0,1fr)_20rem]' : 'xl:grid-cols-[minmax(0,1fr)_20rem]',
            )}
          >
            {showPicker ? (
              <div className="min-w-0">
                <ConsultantPicker
                  items={consultants}
                  value={consultantId}
                  onChange={(id) => {
                    setConsultantId(id);
                    setSelectedId(null);
                  }}
                  total={searched.filter((r) => inPeriod(r, period)).length}
                />
              </div>
            ) : null}

            <div className={cn(dataTablePanelClass, 'min-w-0')}>
              <div className="px-4 pt-4 sm:px-5">
                <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">{scopeTitle}</h2>
                <p className="text-sm text-(--lifeops-muted)">
                  {numberEs.format(filtered.length)} recibo(s) en «{PERIODS.find((p) => p.value === period)?.label}»
                </p>
              </div>
              <ListSearchFilters
                value={searchDraft}
                onChange={setSearchDraft}
                onSubmit={() => setSearch(searchDraft.trim())}
                placeholder={officeView ? 'Póliza, cliente, asesor o forma de pago…' : 'Póliza, cliente o forma de pago…'}
                id="collections-search"
                className="flex flex-wrap items-end gap-3 border-b border-(--lifeops-border) px-4 py-3 sm:px-5"
              />

              {error ? (
                <p className="px-4 py-10 text-center text-sm text-(--lifeops-muted)" role="alert">
                  {error}
                </p>
              ) : loading && !board ? (
                <TableSkeleton />
              ) : (
                <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
                  <DataTable<CollectionBoardRow>
                    rows={pageRows}
                    getRowKey={(row) => row.contract_id}
                    selectedRowKey={selectedId}
                    onRowClick={(row) => setSelectedId(row.contract_id)}
                    empty={
                      search.trim()
                        ? 'No hay recibos que coincidan con la búsqueda.'
                        : period === 'today'
                          ? 'Ningún recibo vence hoy.'
                          : 'No hay recibos en este periodo.'
                    }
                    columns={columns}
                  />
                  <TablePagination
                    page={page}
                    pageSize={pageSize}
                    total={sortedItems.length}
                    disabled={loading}
                    onPageChange={setPage}
                    onPageSizeChange={setPageSize}
                  />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-col gap-4">
              <ReceiptPanel row={selected} onRegisterPayment={openPayment} onAddPhone={(row) => void openClientEdit(row)} />
              <CollectionAgingCard
                title={selectedConsultant ? selectedConsultant.name : officeView ? 'Toda la promotoría' : 'Tu cartera'}
                subtitle="Pólizas en vigor por antigüedad del atraso"
                rows={consultantId ? rows.filter((r) => r.consultant_id === consultantId) : rows}
                href={officeView && consultantId ? `/dashboard/consultants/${consultantId}` : undefined}
              />
            </div>
          </div>
        </>
      )}

      <EditClientDialog
        open={editingClient != null}
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSaved={() => {
          toast.success('Cliente actualizado.');
          setLoading(true);
          void loadBoard();
        }}
      />

      <RegisterPaymentDialog
        open={paymentTarget != null}
        target={paymentTarget}
        onClose={() => setPaymentTarget(null)}
        onSaved={async () => {
          setLoading(true);
          await loadBoard();
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
