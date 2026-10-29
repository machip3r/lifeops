'use client';

import { useCallback, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { Contract, ContractPortfolio, ContractPortfolioRow } from '@/lib/supabase';
import { db } from '@/lib/db';
import { FilterChips } from '@/components/ui/filter-chips';
import { DataTable, dataTablePanelClass, type DataTableColumn } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { MissingPaymentMethodFlag } from '@/components/contracts/missing-payment-method';
import { EditContractDialog } from '@/components/contracts/edit-contract-dialog';
import { RowActions } from '@/components/ui/row-edit-button';
import { useToast } from '@/components/toast';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, type SortDir } from '@/lib/table-sort';
import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { PORTFOLIO_STATUS, type PortfolioStatus } from '@/lib/collections/status';
import { CURRENCY_LABELS } from '@/lib/contracts/currencies';
import { POLICY_STATUS, POLICY_STATUSES, type PolicyStatus } from '@/lib/contracts/policy-status';
import { DotBadge } from '@/components/ui/dot-badge';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';
import { TableSkeleton } from '@/components/ui/skeleton';

type SortKey =
  | 'contract_number'
  | 'client_name'
  | 'consultant_name'
  | 'issue_date'
  | 'next_due'
  | 'payment_method';
type StatusFilter = 'all' | PortfolioStatus;
type PolicyFilter = 'all' | PolicyStatus;

/** Chip order: critical first, like Cobranza and Vista general. */
const STATUS_CHIPS: PortfolioStatus[] = ['at_risk', 'overdue', 'due_soon', 'current', 'no_payment'];

/**
 * Pólizas table with cartera status (`list_contract_portfolio`): search, póliza status (en vigor by
 * default; anuladas, prorrogadas, sin pago de primas) and cartera chips with counts,
 * server-side sort and pagination. Used by Pólizas, the client expediente and the asesor expediente.
 */
export function ContractPortfolioPanel({
  scope,
  showClient = true,
  showConsultant = false,
  title,
  description,
  actions,
  searchPlaceholder = 'Póliza o cliente…',
  emptyText = 'Aún no hay pólizas. Regístralas o impórtalas desde el extractor.',
  onLoaded,
}: {
  scope: { officeId?: string; consultantId?: string; clientId?: string };
  showClient?: boolean;
  showConsultant?: boolean;
  title?: string;
  description?: string;
  actions?: ReactNode;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Receives each loaded page (counters read `summary`) */
  onLoaded?: (portfolio: ContractPortfolio) => void;
}) {
  const router = useRouter();
  const { officeId, consultantId, clientId } = scope;
  const { toast } = useToast();
  const [portfolio, setPortfolio] = useState<ContractPortfolio | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Contract | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('next_due');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [policyFilter, setPolicyFilter] = useState<PolicyFilter>('IN_FORCE');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const scopeKey = `${officeId ?? ''}\0${consultantId ?? ''}\0${clientId ?? ''}`;
  const filterKey = `${scopeKey}\0${search}\0${policyFilter}\0${statusFilter}\0${pageSize}\0${sortKey}\0${sortDir}`;
  const [page, setPage] = useResetPage(filterKey);
  const [loading, setLoading] = useQueryLoading(`${filterKey}\0${page}`);

  const load = useCallback(async () => {
    try {
      const result = await db.contract.listPortfolio({
        officeId,
        consultantId,
        clientId,
        search: search || undefined,
        status: statusFilter === 'all' ? null : statusFilter,
        policyStatus: policyFilter === 'all' ? null : policyFilter,
        sort: { column: sortKey, ascending: sortDir === 'asc' },
        page,
        pageSize,
        riskDays: POLICY_AT_RISK_DAYS,
        dueSoonDays: PENDING_PAYMENT_WITHIN_DAYS,
      });
      setPortfolio(result);
      setError(null);
      onLoaded?.(result);
    } catch (e) {
      console.error('Error loading contracts:', e);
      setError('No se pudieron cargar las pólizas.');
    } finally {
      setLoading(false);
    }
  }, [officeId, consultantId, clientId, search, policyFilter, statusFilter, sortKey, sortDir, page, pageSize, setLoading, onLoaded]);

  useQueryEffect(Boolean(officeId || consultantId), load);

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

  // The table row has no premium / project fields: load the full póliza for the dialog
  const openEdit = async (contractId: string) => {
    setEditing(null);
    setEditOpen(true);
    try {
      const contract = await db.contract.getContractById(contractId);
      if (!contract) throw new Error('not found');
      setEditing(contract);
    } catch (e) {
      console.error('Error loading contract for edit:', e);
      setEditOpen(false);
      toast.error('No se pudo abrir la póliza.');
    }
  };

  const counts = portfolio?.counts;
  const policyCounts = portfolio?.policy_counts;
  // Cartera buckets only mean something for pólizas en vigor
  const showCarteraChips = policyFilter === 'IN_FORCE' || policyFilter === 'all';
  const rows = portfolio?.rows ?? [];
  const columns: DataTableColumn<ContractPortfolioRow>[] = [
    {
      id: 'contract_number',
      header: 'Póliza',
      tone: 'accent',
      className: 'font-mono text-[13px]',
      sort: sortFor('contract_number', 'Póliza'),
      cell: (row) => row.contract_number || 'Sin número',
    },
    ...(showClient
      ? [
          {
            id: 'client_name',
            header: 'Cliente',
            className: 'max-w-[16rem] truncate',
            sort: sortFor('client_name', 'Cliente'),
            cell: (row: ContractPortfolioRow) => row.client_name || '—',
          },
        ]
      : []),
    ...(showConsultant
      ? [
          {
            id: 'consultant_name',
            header: 'Asesor',
            tone: 'muted' as const,
            className: 'max-w-[14rem] truncate',
            sort: sortFor('consultant_name', 'Asesor'),
            cell: (row: ContractPortfolioRow) => row.consultant_name || '—',
          },
        ]
      : []),
    {
      id: 'payment_method',
      header: 'Forma de pago',
      tone: 'muted',
      sort: sortFor('payment_method', 'Forma de pago'),
      cell: (row) => row.payment_method || <MissingPaymentMethodFlag />,
    },
    {
      id: 'currency',
      header: 'Moneda',
      tone: 'muted',
      cell: (row) => (row.currency ? CURRENCY_LABELS[row.currency] ?? row.currency : '—'),
    },
    {
      id: 'issue_date',
      header: 'Emisión',
      tone: 'muted',
      sort: sortFor('issue_date', 'Emisión'),
      cell: (row) => formatDateShortEsLocal(row.issue_date),
    },
    {
      id: 'next_due',
      header: 'Próximo cobro',
      className: 'tabular-nums',
      sort: sortFor('next_due', 'Próximo cobro'),
      cell: (row) => (row.next_due ? formatDateShortEsLocal(row.next_due) : '—'),
    },
    {
      id: 'cartera_status',
      header: 'Estado',
      cell: (row) =>
        row.cartera_status === 'inactive' ? (
          <DotBadge
            label={POLICY_STATUS[row.status]?.label ?? PORTFOLIO_STATUS.inactive.label}
            color={POLICY_STATUS[row.status]?.color ?? PORTFOLIO_STATUS.inactive.color}
          />
        ) : (
          <CarteraStatusBadge status={row.cartera_status} daysOverdue={row.days_past_due} />
        ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      sticky: true,
      cell: (row) => (
        <RowActions
          editLabel={`Editar póliza ${row.contract_number ?? ''}`.trim()}
          onEdit={() => void openEdit(row.id)}
        />
      ),
    },
  ];

  return (
    <div className={dataTablePanelClass}>
      <EditContractDialog
        open={editOpen}
        contract={editing}
        onClose={() => {
          setEditOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          toast.success('Póliza actualizada.');
          setLoading(true);
          void load();
        }}
      />

      {title ? (
        <div className="px-4 pt-4 sm:px-5">
          <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">{title}</h2>
          {description ? <p className="mt-0.5 text-sm text-(--lifeops-muted)">{description}</p> : null}
        </div>
      ) : null}

      <ListSearchFilters
        value={searchDraft}
        onChange={setSearchDraft}
        onSubmit={() => setSearch(searchDraft.trim())}
        placeholder={searchPlaceholder}
        id={`contracts-search-${clientId ?? consultantId ?? 'all'}`}
        className="flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5"
        actions={actions}
      />

      <div className="space-y-3 border-b border-(--lifeops-border) px-4 pb-4 sm:px-5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 text-xs font-medium text-(--lifeops-muted)">Estatus de la póliza</span>
          <FilterChips
            label="Estatus de la póliza"
            value={policyFilter}
            onChange={(next) => {
              setPolicyFilter(next);
              if (next !== 'IN_FORCE' && next !== 'all') setStatusFilter('all');
            }}
            options={[
              ...POLICY_STATUSES.map((status) => ({
                value: status,
                label: POLICY_STATUS[status].plural,
                color: POLICY_STATUS[status].color,
                count: policyCounts?.[status],
              })),
              { value: 'all' as const, label: 'Todas', count: policyCounts?.all },
            ]}
          />
        </div>
        {showCarteraChips ? (
          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span className="shrink-0 text-xs font-medium text-(--lifeops-muted)">Cobranza</span>
            <FilterChips
              label="Estado de cobranza"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'all', label: policyFilter === 'IN_FORCE' ? 'Todas en vigor' : 'Todas', count: counts?.all },
                ...STATUS_CHIPS.map((status) => ({
                  value: status,
                  label: PORTFOLIO_STATUS[status].label,
                  color: PORTFOLIO_STATUS[status].color,
                  count: counts?.[status],
                })),
                ...(policyFilter === 'all'
                  ? [
                      {
                        value: 'inactive' as const,
                        label: PORTFOLIO_STATUS.inactive.label,
                        color: PORTFOLIO_STATUS.inactive.color,
                        count: counts?.inactive,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ) : (
          <p className="text-xs text-(--lifeops-muted)">
            {POLICY_STATUS[policyFilter].description}
          </p>
        )}
      </div>

      {error ? (
        <p className="px-4 py-10 text-center text-sm text-(--lifeops-muted)" role="alert">
          {error}
        </p>
      ) : loading && !portfolio ? (
        <TableSkeleton />
      ) : (
        <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
          <DataTable<ContractPortfolioRow>
            rows={rows}
            getRowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/dashboard/contracts/${row.id}`)}
            empty={
              policyCounts?.all === 0 && !search
                ? emptyText
                : policyFilter !== 'all' && policyCounts?.[policyFilter] === 0 && !search
                  ? `No hay pólizas con estatus «${POLICY_STATUS[policyFilter].label}».`
                  : 'No hay pólizas que coincidan con la búsqueda o el estado.'
            }
            columns={columns}
          />
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={portfolio?.total ?? 0}
            disabled={loading}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      )}
    </div>
  );
}
