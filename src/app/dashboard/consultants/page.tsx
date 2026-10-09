'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { SortableTh } from '@/components/sortable-th';
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
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-400';
const ACTIONS_TH =
  'px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';
const ACTIONS_TD =
  'px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';

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
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
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
        <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <SortableTh label="Nombre" active={sortKey === 'name'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'name');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Correo Electrónico" active={sortKey === 'email'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'email');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Código" active={sortKey === 'consultant_code'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'consultant_code');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Fecha de Invitación" active={sortKey === 'created_at'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'created_at');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <th className={ACTIONS_TH}>
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {(() => {
              if (consultants.length === 0) {
                return (
                  <tr>
                    <td colSpan={5} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      {total === 0
                        ? 'No hay asesores registrados. Invita uno para comenzar.'
                        : 'No hay asesores que coincidan con la búsqueda.'}
                    </td>
                  </tr>
                );
              }

              return consultants.map((consultant) => (
                <tr
                  key={consultant.id || `temp-${consultant.name}`}
                  onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group"
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    {consultant.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.email || <span className="text-gray-400 italic">No establecido</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.consultant_code || <span className="text-gray-400 italic">No establecido</span>}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDateShortEsLocal(consultant.created_at)}
                  </td>
                  <td
                    className={`${ACTIONS_TD} group-hover:bg-gray-50 dark:group-hover:bg-gray-700`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                    >
                      Ver
                    </button>
                  </td>
                </tr>
              ));
            })()}
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
