'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { InviteConsultantDialog } from '@/components/consultants/invite-consultant-dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';

type SortKey = 'name' | 'email' | 'consultant_code' | 'status' | 'sales' | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-400';
const ACTIONS_TH =
  'px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';
const ACTIONS_TD =
  'px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';

function getCurrentMonthStartEnd(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

function ConsultantsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const { start: defaultStart, end: defaultEnd } = getCurrentMonthStartEnd();
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);
  const [pendingDateStart, setPendingDateStart] = useState(defaultStart);
  const [pendingDateEnd, setPendingDateEnd] = useState(defaultEnd);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [salesByConsultant, setSalesByConsultant] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [consultantToDelete, setConsultantToDelete] = useState<Consultant | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const loadConsultants = useCallback(async () => {
    try {
      if (!profile?.id) {
        setLoading(false);
        return;
      }

      const dbSort =
        sortKey && sortKey !== 'sales'
          ? { column: sortKey, ascending: sortDir === 'asc' }
          : undefined;

      const [pageResult, sales] = await Promise.all([
        db.consultant.getConsultantsByOfficePage(profile.id, {
          page,
          pageSize,
          search,
          status: 'ALL',
          sort: dbSort,
        }),
        db.dashboard.getOfficeConsultantsSales(profile.id, dateStart, dateEnd),
      ]);

      setConsultants(pageResult.rows);
      setTotal(pageResult.total);
      const map: Record<string, number> = {};
      sales.forEach((s) => {
        map[s.consultant_id] = s.total_sales;
      });
      setSalesByConsultant(map);
      setLoadError('');
    } catch (error) {
      console.error('Error loading consultants:', error);
      setLoadError('Error al cargar los asesores. Por favor recarga la página.');
    } finally {
      setLoading(false);
    }
  }, [
    profile?.id,
    dateStart,
    dateEnd,
    page,
    pageSize,
    search,
    sortKey,
    sortDir,
  ]);

  useEffect(() => {
    if (profile?.role === 'promotory' && profile.id) {
      loadConsultants();
    }
  }, [profile, loadConsultants]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, sortKey, sortDir]);

  const openDeleteDialog = (consultant: Consultant) => {
    setConsultantToDelete(consultant);
  };

  const closeDeleteDialog = () => {
    if (deletingId) return;
    setConsultantToDelete(null);
  };

  const confirmDeleteConsultant = async () => {
    if (!profile?.id || !consultantToDelete?.id) return;

    setDeletingId(consultantToDelete.id);
    try {
      const res = await authFetch('/api/consultants/delete', {
        method: 'POST',
        body: JSON.stringify({
          consultantId: consultantToDelete.id,
          officeId: profile.id,
          forceDelete: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo desactivar el asesor.');
      }
      toast.success(
        data.action === 'deactivated'
          ? 'Asesor desactivado. Sus pólizas se conservan.'
          : 'Asesor eliminado.',
      );
      setConsultantToDelete(null);
      await loadConsultants();
    } catch (error: unknown) {
      console.error('Error deactivating consultant:', error);
      toast.error(
        error instanceof Error ? error.message : 'Error al desactivar el asesor',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const deleteDialogLabel =
    consultantToDelete?.name?.trim() ||
    consultantToDelete?.consultant_code?.trim() ||
    'este asesor';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando asesores...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">
          Asesores
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona tus asesores. Ventas filtradas por fecha de pago (período).
        </p>
      </div>

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
              <SortableTh label="Estado" active={sortKey === 'status'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'status');
                setSortKey(next.key); setSortDir(next.dir);
              }} className={TH} />
              <SortableTh label="Ventas (período)" active={sortKey === 'sales'} dir={sortDir} onSort={() => {
                const next = nextSortState(sortKey, sortDir, 'sales');
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
              const displayed =
                sortKey === 'sales'
                  ? sortRows(
                      consultants,
                      'sales',
                      sortDir,
                      { sales: (c) => salesByConsultant[c.id] ?? 0 },
                      { sales: 'number' },
                    )
                  : consultants;

              if (displayed.length === 0) {
                return (
                  <tr>
                    <td colSpan={7} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      {total === 0
                        ? 'No hay asesores registrados. Invita uno para comenzar.'
                        : 'No hay asesores que coincidan con la búsqueda.'}
                    </td>
                  </tr>
                );
              }

              return displayed.map((consultant) => (
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${consultant.status === 'ACTIVE'
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : consultant.status === 'PENDING'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                      }`}>
                      {consultant.status === 'ACTIVE' ? 'Activo' : consultant.status === 'PENDING' ? 'Pendiente' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    ${(salesByConsultant[consultant.id] ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {formatDateShortEsLocal(consultant.created_at)}
                  </td>
                  <td
                    className={`${ACTIONS_TD} group-hover:bg-gray-50 dark:group-hover:bg-gray-700`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end items-center gap-3 flex-nowrap">
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                      >
                        Ver Detalles
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === consultant.id || consultant.status === 'INACTIVE'}
                        onClick={() => openDeleteDialog(consultant)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
                        aria-label={`Desactivar asesor ${consultant.name || consultant.consultant_code || ''}`}
                      >
                        {deletingId === consultant.id ? 'Desactivando…' : 'Desactivar'}
                      </button>
                    </div>
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

      <ConfirmDialog
        open={consultantToDelete != null}
        title="Desactivar asesor"
        description={`¿Desactivar a ${deleteDialogLabel}?\n\nEl asesor pasará a estado inactivo. Sus pólizas, clientes y cobranza se conservan.`}
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        loadingLabel="Desactivando…"
        loading={deletingId != null && deletingId === consultantToDelete?.id}
        onConfirm={() => void confirmDeleteConsultant()}
        onCancel={closeDeleteDialog}
      />

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
