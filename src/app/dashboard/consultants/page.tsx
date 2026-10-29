'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText, Gauge, Siren, UserPlus, UsersRound } from 'lucide-react';
import type { Consultant, ConsultantPortfolio, ConsultantPortfolioRow } from '@/lib/supabase';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { DataTable, dataTablePanelClass, type DataTableColumn } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { InviteConsultantDialog } from '@/components/consultants/invite-consultant-dialog';
import { EditConsultantDialog } from '@/components/consultants/edit-consultant-dialog';
import { RowActions } from '@/components/ui/row-edit-button';
import { useToast } from '@/components/toast';
import { CarteraMiniBar } from '@/components/collections/cartera-mini-bar';
import { Button } from '@/components/ui/button';
import { DotBadge } from '@/components/ui/dot-badge';
import { FilterChips } from '@/components/ui/filter-chips';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { PageHeader } from '@/components/dashboard/page-header';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, type SortDir } from '@/lib/table-sort';
import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { CONSULTANT_STATUS } from '@/lib/consultants/status';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';
import { StatTilesSkeleton, TableSkeleton } from '@/components/ui/skeleton';

type SortKey = 'name' | 'consultant_code' | 'created_at' | 'active_contracts' | 'healthy_share' | 'late';
type Filter = 'all' | Consultant['status'];

const STATUS_CHIPS: Consultant['status'][] = ['ACTIVE', 'PENDING', 'NOT_INVITED', 'INACTIVE'];
const percentEs = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 0 });

function ConsultantsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [portfolio, setPortfolio] = useState<ConsultantPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Consultant | null>(null);
  const { toast } = useToast();
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const filterKey = `${search}\0${filter}\0${pageSize}\0${sortKey}\0${sortDir}`;
  const [page, setPage] = useResetPage(filterKey);
  const [loading, setLoading] = useQueryLoading(`${profile?.id ?? ''}\0${filterKey}\0${page}`);

  const loadConsultants = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const result = await db.consultant.listPortfolio({
        officeId: profile.id,
        search: search || undefined,
        status: filter === 'all' ? null : filter,
        sort: { column: sortKey, ascending: sortDir === 'asc' },
        page,
        pageSize,
        riskDays: POLICY_AT_RISK_DAYS,
        dueSoonDays: PENDING_PAYMENT_WITHIN_DAYS,
      });
      setPortfolio(result);
      setError(null);
    } catch (e) {
      console.error('Error loading consultants:', e);
      setError('No se pudieron cargar los asesores. Recarga la página.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, search, filter, sortKey, sortDir, page, pageSize, setLoading]);

  useQueryEffect(Boolean(profile?.role === 'promotory' && profile.id), loadConsultants);

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

  const summary = portfolio?.summary;
  const counts = portfolio?.counts;
  const columns: DataTableColumn<ConsultantPortfolioRow>[] = [
    {
      id: 'name',
      header: 'Asesor',
      sort: sortFor('name', 'Asesor'),
      cell: (row) => (
        <div className="min-w-0 max-w-[18rem]">
          <p className="truncate font-medium text-(--lifeops-accent)">{row.name}</p>
          <p className="truncate text-xs text-(--lifeops-muted)">{row.email || 'Sin correo'}</p>
        </div>
      ),
    },
    {
      id: 'consultant_code',
      header: 'Clave',
      tone: 'muted',
      className: 'font-mono text-[13px]',
      sort: sortFor('consultant_code', 'Clave'),
      cell: (row) => row.consultant_code || '—',
    },
    {
      id: 'created_at',
      header: 'Alta',
      tone: 'muted',
      sort: sortFor('created_at', 'Alta'),
      cell: (row) => formatDateShortEsLocal(row.created_at?.slice(0, 10)),
    },
    {
      id: 'active_contracts',
      header: 'Pólizas',
      align: 'right',
      className: 'tabular-nums',
      sort: sortFor('active_contracts', 'Pólizas'),
      cell: (row) => (
        <span>
          {row.active_contracts}
          <span className="ml-1 text-xs text-(--lifeops-muted)">· {row.clients} cl.</span>
        </span>
      ),
    },
    {
      id: 'healthy_share',
      header: 'Al día',
      sort: sortFor('healthy_share', 'Al día'),
      cell: (row) =>
        row.healthy_share == null ? (
          <span className="text-(--lifeops-muted)">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <span className="w-10 tabular-nums">{percentEs.format(row.healthy_share)}</span>
            <CarteraMiniBar counts={row} />
          </div>
        ),
    },
    {
      id: 'late',
      header: 'Con atraso',
      align: 'right',
      className: 'tabular-nums',
      sort: sortFor('late', 'Con atraso'),
      cell: (row) =>
        row.overdue + row.at_risk === 0 ? (
          <span className="text-(--lifeops-muted)">0</span>
        ) : (
          <span>
            {row.overdue + row.at_risk}
            {row.at_risk ? (
              <span className="ml-1 text-xs text-(--lifeops-muted)">· {row.at_risk} en peligro</span>
            ) : null}
          </span>
        ),
    },
    {
      id: 'payments',
      header: 'Pagos 30 días',
      align: 'right',
      tone: 'muted',
      className: 'tabular-nums',
      cell: (row) => row.payments_last_30_days,
    },
    {
      id: 'status',
      header: 'Acceso',
      cell: (row) => <DotBadge {...CONSULTANT_STATUS[row.status]} />,
    },
    {
      id: 'actions',
      header: <span className="sr-only">Acciones</span>,
      align: 'right',
      sticky: true,
      cell: (row) => (
        <RowActions
          editLabel={`Editar a ${row.name}`}
          onEdit={() =>
            setEditing({
              id: row.id,
              name: row.name,
              email: row.email,
              consultant_code: row.consultant_code,
              status: row.status,
              office_id: profile?.id ?? '',
              auth_user_id: null,
            })
          }
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Asesores"
        watermark="Asesores"
        description="Cartera y cobranza de cada asesor, y su acceso a LifeOps."
      />

      {summary ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Asesores"
            icon={UsersRound}
            value={summary ? numberEs.format(summary.consultants) : '—'}
            detail={
              summary
                ? `${numberEs.format(summary.active)} con acceso · ${numberEs.format(summary.pending_invites)} por invitar o aceptar`
                : undefined
            }
          />
          <StatTile
            label="Pólizas en cartera"
            icon={FileText}
            value={summary ? numberEs.format(summary.active_contracts) : '—'}
            detail="Pólizas activas de todos los asesores"
          />
          <StatTile
            label="Cartera al día"
            icon={Gauge}
            value={summary?.healthy_share != null ? percentEs.format(summary.healthy_share) : '—'}
            detail="Al corriente o por vencer, del total con próximo cobro"
          />
          <StatTile
            label="Con pólizas en peligro"
            icon={Siren}
            value={summary ? numberEs.format(summary.with_at_risk) : '—'}
            detail={summary?.at_risk_names.length ? summary.at_risk_names.join(', ') : 'Ningún asesor por ahora'}
          />
        </div>
      ) : (
        <StatTilesSkeleton />
      )}

      <div className={dataTablePanelClass}>
        <ListSearchFilters
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={() => setSearch(searchDraft.trim())}
          placeholder="Nombre, clave o correo…"
          id="consultants-search"
          className="flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5"
          actions={
            <Button type="button" variant="brand" size="lg" onClick={() => setIsDialogOpen(true)}>
              Crear asesor
            </Button>
          }
        />

        <FilterChips
          label="Filtrar por acceso"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos', count: counts?.all },
            ...STATUS_CHIPS.map((status) => ({
              value: status,
              ...CONSULTANT_STATUS[status],
              count: counts?.[status],
            })),
          ]}
          className="border-b border-(--lifeops-border) px-4 pb-4 sm:px-5"
        />

        {error ? (
          <p className="px-4 py-10 text-center text-sm text-(--lifeops-muted)" role="alert">
            {error}
          </p>
        ) : loading && !portfolio ? (
          <TableSkeleton />
        ) : (
          <div className={loading ? 'opacity-60 transition-opacity' : undefined}>
            <DataTable<ConsultantPortfolioRow>
              rows={portfolio?.rows ?? []}
              getRowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/dashboard/consultants/${row.id}`)}
              empty={
                counts?.all === 0 && !search ? (
                  <EmptyState
                    size="sm"
                    icon={UserPlus}
                    title="Aún no hay asesores"
                    description="Invítalos con «Invitar asesor», o se crean solos como «Sin invitar» al importar tu Mina de Oro o tus comisiones."
                    actions={
                      <Button asChild variant="outline">
                        <Link href="/dashboard/extractor">Ir a Importar</Link>
                      </Button>
                    }
                  />
                ) : (
                  'No hay asesores que coincidan con la búsqueda o el filtro.'
                )
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

      {profile?.id && editing ? (
        <EditConsultantDialog
          open
          consultant={editing}
          officeId={profile.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            toast.success('Asesor actualizado.');
            setLoading(true);
            void loadConsultants();
          }}
        />
      ) : null}

      {profile?.id ? (
        <InviteConsultantDialog
          open={isDialogOpen}
          officeId={profile.id}
          onClose={() => setIsDialogOpen(false)}
          onInvited={() => {
            setLoading(true);
            void loadConsultants();
          }}
        />
      ) : null}
    </div>
  );
}

export default function ConsultantsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory']}>
      <ConsultantsPageContent />
    </ProtectedRoute>
  );
}
