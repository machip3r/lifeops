'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmptyState } from '@/components/ui/empty-state';
import { Cake, ContactRound, Siren, Users, UsersRound } from 'lucide-react';
import type { Client, ClientPortfolio, ClientPortfolioFilter, ClientPortfolioRow } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { useToast } from '@/components/toast';
import { DataTable, dataTablePanelClass, type DataTableColumn } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { ClientStatusBadge } from '@/components/clients/client-status-badge';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { RowActions } from '@/components/ui/row-edit-button';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/filter-chips';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { PageHeader } from '@/components/dashboard/page-header';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, type SortDir } from '@/lib/table-sort';
import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { CARTERA_STATUS } from '@/lib/collections/status';
import { ageFromBirthDate, formatDateShortEsLocal } from '@/lib/format/date';
import { formatMxPhone } from '@/lib/validation/input-filters';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';
import { StatTilesSkeleton, TableSkeleton } from '@/components/ui/skeleton';

type SortKey = 'name' | 'active_contracts' | 'birth_date' | 'next_due' | 'status';
type Filter = 'all' | ClientPortfolioFilter;

const FILTER_CHIPS: Array<{ value: ClientPortfolioFilter; label: string; color?: string }> = [
  { value: 'with_active', label: 'Con póliza activa' },
  { value: 'late', label: 'Con atraso', color: CARTERA_STATUS.overdue.color },
  { value: 'at_risk', label: 'En peligro', color: CARTERA_STATUS.at_risk.color },
  { value: 'no_active', label: 'Sin póliza activa', color: 'var(--lifeops-muted)' },
];

function ClientsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const officeView = profile?.role === 'promotory';
  const [portfolio, setPortfolio] = useState<ClientPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filter, setFilter] = useState<Filter>('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const filterKey = `${search}\0${filter}\0${pageSize}\0${sortKey}\0${sortDir}`;
  const [page, setPage] = useResetPage(filterKey);
  const [loading, setLoading] = useQueryLoading(`${profile?.id ?? ''}\0${filterKey}\0${page}`);

  const loadClients = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const result = await db.client.listPortfolio({
        officeId: officeView ? profile.id : undefined,
        consultantId: officeView ? undefined : profile.id,
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
      console.error('Error loading clients:', e);
      setError('No se pudieron cargar los clientes.');
    } finally {
      setLoading(false);
    }
  }, [profile?.id, officeView, search, filter, sortKey, sortDir, page, pageSize, setLoading]);

  useQueryEffect(Boolean(profile), loadClients);

  const handleCreate = async (data: {
    name: string;
    date_of_birth: string;
    curp: string | null;
    rfc: string | null;
    phone: string | null;
    email: string | null;
  }) => {
    try {
      const officeId = profile?.role === 'promotory' ? profile.id : profile?.office_id;
      const client = await db.client.findOrCreateClient({
        name: data.name,
        birthDate: data.date_of_birth || null,
        officeId: officeId ?? null,
        curp: data.curp,
        rfc: data.rfc,
      });
      if (data.phone || data.email) {
        await db.client.updateClient(client.id, { phone: data.phone, email: data.email });
      }
      toast.success('Cliente creado.');
      setShowForm(false);
      router.push(`/dashboard/clients/${client.id}`);
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'code' in err && (err as { code?: string }).code === '23505'
          ? 'Ya existe un cliente con ese CURP o RFC.'
          : err instanceof Error
            ? err.message
            : 'No se pudo guardar el cliente.';
      throw new Error(message);
    }
  };

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
  const columns: DataTableColumn<ClientPortfolioRow>[] = [
    {
      id: 'name',
      header: 'Cliente',
      sort: sortFor('name', 'Cliente'),
      cell: (row) => (
        <div className="min-w-0 max-w-[18rem]">
          <p className="truncate font-medium text-(--lifeops-accent)">{row.name}</p>
          {row.curp || row.rfc ? (
            <p className="truncate font-mono text-xs text-(--lifeops-muted)">{row.rfc || row.curp}</p>
          ) : null}
        </div>
      ),
    },
    {
      id: 'phone',
      header: 'Teléfono',
      tone: 'muted',
      className: 'tabular-nums',
      cell: (row) => (row.phone ? formatMxPhone(row.phone) : '—'),
    },
    {
      id: 'email',
      header: 'Correo',
      tone: 'muted',
      className: 'max-w-[16rem] truncate',
      cell: (row) => row.email || '—',
    },
    ...(officeView
      ? [
          {
            id: 'consultants',
            header: 'Asesor',
            tone: 'muted' as const,
            className: 'max-w-[14rem] truncate',
            cell: (row: ClientPortfolioRow) => row.consultant_names || '—',
          },
        ]
      : []),
    {
      id: 'birth_date',
      header: 'Nacimiento',
      tone: 'muted',
      sort: sortFor('birth_date', 'Nacimiento'),
      cell: (row) => {
        const age = ageFromBirthDate(row.birth_date);
        return row.birth_date ? `${formatDateShortEsLocal(row.birth_date)}${age != null ? ` · ${age} años` : ''}` : '—';
      },
    },
    {
      id: 'active_contracts',
      header: 'Pólizas en vigor',
      align: 'right',
      className: 'tabular-nums',
      sort: sortFor('active_contracts', 'Pólizas en vigor'),
      cell: (row) => row.active_contracts,
    },
    {
      id: 'next_due',
      header: 'Próximo cobro',
      className: 'tabular-nums',
      sort: sortFor('next_due', 'Próximo cobro'),
      cell: (row) => (row.next_due ? formatDateShortEsLocal(row.next_due) : '—'),
    },
    {
      id: 'status',
      header: 'Estado',
      sort: sortFor('status', 'Estado'),
      cell: (row) => <ClientStatusBadge status={row.cartera_status} daysOverdue={row.days_past_due} />,
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
              birth_date: row.birth_date,
              curp: row.curp,
              rfc: row.rfc,
              phone: row.phone,
              email: row.email,
            })
          }
        />
      ),
    },
  ];

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Clientes"
        watermark="Clientes"
        description="Registro único de tus clientes: contacto, pólizas en vigor y cómo van con sus pagos."
      />

      <EditClientDialog
        open={editing != null}
        client={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          toast.success('Cliente actualizado.');
          setLoading(true);
          void loadClients();
        }}
      />

      <ClientFormDialog
        open={showForm}
        editingClient={null}
        onClose={() => setShowForm(false)}
        onSubmit={handleCreate}
      />

      {summary ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Clientes"
            icon={Users}
            value={summary ? numberEs.format(summary.clients) : '—'}
            detail={summary ? `${numberEs.format(summary.with_active)} con póliza activa` : undefined}
          />
          <StatTile
            label="Con pagos atrasados"
            icon={Siren}
            value={summary ? numberEs.format(summary.late) : '—'}
            detail={summary ? `${numberEs.format(summary.at_risk)} en peligro (más de ${POLICY_AT_RISK_DAYS} días)` : undefined}
          />
          <StatTile
            label="Cumpleaños este mes"
            icon={Cake}
            value={summary ? numberEs.format(summary.birthdays_this_month) : '—'}
            detail="Buen momento para saludarlos"
          />
          <StatTile
            label="Sin datos de contacto"
            icon={ContactRound}
            value={summary ? numberEs.format(summary.missing_contact) : '—'}
            detail="Sin teléfono ni correo"
          />
        </div>
      ) : (
        <StatTilesSkeleton />
      )}

      <div className={dataTablePanelClass}>
        <ListSearchFilters
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => setSearch(draftSearch.trim())}
          placeholder={officeView ? 'Nombre, RFC, teléfono, correo o asesor…' : 'Nombre, RFC, teléfono o correo…'}
          id="clients-search"
          className="flex flex-wrap items-end gap-3 px-4 py-3 sm:px-5"
          actions={
            <Button type="button" variant="brand" size="lg" onClick={() => setShowForm(true)}>
              Nuevo cliente
            </Button>
          }
        />

        <FilterChips
          label="Filtrar clientes"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos', count: counts?.all },
            ...FILTER_CHIPS.map((chip) => ({ ...chip, count: counts?.[chip.value] })),
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
            <DataTable<ClientPortfolioRow>
              rows={portfolio?.rows ?? []}
              getRowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/dashboard/clients/${row.id}`)}
              empty={
                counts?.all === 0 && !search ? (
                  <EmptyState
                    size="sm"
                    icon={UsersRound}
                    title="Aún no hay clientes"
                    description="Se crean solos al importar tu cartera o tus comisiones. También puedes registrarlos con «Nuevo cliente»."
                    actions={
                      <Button asChild variant="outline">
                        <Link href="/dashboard/extractor">Ir a Importar</Link>
                      </Button>
                    }
                  />
                ) : (
                  'No hay clientes que coincidan con la búsqueda o el filtro.'
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
    </div>
  );
}

export default function ClientsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ClientsPageContent />
    </ProtectedRoute>
  );
}
