'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { DataTable, dataTablePanelClass } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { InviteConsultantDialog } from '@/components/consultants/invite-consultant-dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import { useQueryEffect, useResetPage } from '@/hooks/use-query-effect';

type SortKey = 'name' | 'email' | 'consultant_code' | 'created_at';

function ConsultantsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useResetPage(
    `${search}\0${pageSize}\0${sortKey ?? ''}\0${sortDir}`,
  );
  const [total, setTotal] = useState(0);

  const loadConsultants = useCallback(async () => {
    try {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const dbSort = sortKey
        ? { column: sortKey, ascending: sortDir === 'asc' }
        : undefined;

      const pageResult = await db.consultant.getConsultantsByOfficePage(profile.id, {
        page,
        pageSize,
        search,
        status: 'ALL',
        sort: dbSort,
      });

      setConsultants(pageResult.rows);
      setTotal(pageResult.total);
      setLoadError('');
    } catch (error) {
      console.error('Error loading consultants:', error);
      setLoadError('Error al cargar los asesores. Por favor recarga la página.');
    } finally {
      setLoading(false);
    }
  }, [
    profile?.id,
    page,
    pageSize,
    search,
    sortKey,
    sortDir,
  ]);

  useQueryEffect(Boolean(profile?.role === 'promotory' && profile.id), loadConsultants);

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando asesores...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Asesores"
        watermark="Asesores"
        description="Gestiona tus asesores."
      />

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 dark:text-red-200">{loadError}</p>
        </div>
      )}

      {/* Consultants List */}
      <div className={dataTablePanelClass}>
        <ListSearchFilters
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={() => {
            setSearch(searchDraft);
            setPage(1);
          }}
          placeholder="Nombre, código o correo…"
          id="consultants-search"
          actions={
            <Button
              type="button"
              variant="brand"
              size="lg"
              onClick={() => setIsDialogOpen(true)}
            >
              Invitar asesor
            </Button>
          }
        />
        <DataTable
          rows={consultants}
          getRowKey={(consultant) => consultant.id || `temp-${consultant.name}`}
          onRowClick={(consultant) => router.push(`/dashboard/consultants/${consultant.id}`)}
          empty={
            total === 0
              ? 'No hay asesores registrados. Invita uno para comenzar.'
              : 'No hay asesores que coincidan con la búsqueda.'
          }
          columns={[
            {
              id: 'consultant_code',
              header: 'Código',
              tone: 'accent',
              sort: {
                label: 'Código',
                active: sortKey === 'consultant_code',
                dir: sortDir,
                onSort: () => toggleSort('consultant_code'),
              },
              cell: (consultant) =>
                consultant.consultant_code || (
                  <span className="font-normal italic text-gray-400">No establecido</span>
                ),
            },
            {
              id: 'name',
              header: 'Nombre',
              sort: {
                label: 'Nombre',
                active: sortKey === 'name',
                dir: sortDir,
                onSort: () => toggleSort('name'),
              },
              cell: (consultant) => consultant.name,
            },
            {
              id: 'email',
              header: 'Correo Electrónico',
              tone: 'muted',
              sort: {
                label: 'Correo Electrónico',
                active: sortKey === 'email',
                dir: sortDir,
                onSort: () => toggleSort('email'),
              },
              cell: (consultant) =>
                consultant.email || <span className="italic text-gray-400">No establecido</span>,
            },
            {
              id: 'created_at',
              header: 'Fecha de Invitación',
              tone: 'muted',
              sort: {
                label: 'Fecha de Invitación',
                active: sortKey === 'created_at',
                dir: sortDir,
                onSort: () => toggleSort('created_at'),
              },
              cell: (consultant) => formatDateShortEsLocal(consultant.created_at),
            },
            {
              id: 'actions',
              header: 'Acciones',
              align: 'right',
              sticky: true,
              cell: (consultant) => (
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                  className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  Ver
                </button>
              ),
            },
          ]}
        />
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

      {/* Invite dialog */}
      {profile?.id ? (
        <InviteConsultantDialog
          open={isDialogOpen}
          officeId={profile.id}
          onClose={() => setIsDialogOpen(false)}
          onInvited={() => {
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
