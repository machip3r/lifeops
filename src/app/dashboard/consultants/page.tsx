'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Consultant, ConsultantWithTags, Tag } from '@/lib/supabase';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { ConfirmDialog } from '@/components/confirm-dialog';
import RequestFormDialog from '@/components/request-form-dialog';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import {
  ConsultantTagsEditor,
  TagChips,
  TagMultiFilter,
} from '@/components/consultant-tags';
import {
  TABLE_FILTER_DEBOUNCE_MS,
  useDebouncedValue,
} from '@/hooks/use-debounced-value';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

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
  const [consultants, setConsultants] = useState<ConsultantWithTags[]>([]);
  const [officeTags, setOfficeTags] = useState<Tag[]>([]);
  const [tagFilterIds, setTagFilterIds] = useState<string[]>([]);
  const [tagsEditorFor, setTagsEditorFor] = useState<ConsultantWithTags | null>(null);
  const [salesByConsultant, setSalesByConsultant] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedConsultant, setSelectedConsultant] = useState<Consultant | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, TABLE_FILTER_DEBOUNCE_MS);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE' | 'PENDING'>('ALL');
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

      const [pageResult, sales, tags] = await Promise.all([
        db.consultant.getConsultantsByOfficePage(profile.id, {
          page,
          pageSize,
          search: debouncedSearch,
          status: statusFilter,
          tagIds: tagFilterIds,
          sort: dbSort,
        }),
        db.dashboard.getOfficeConsultantsSales(profile.id, dateStart, dateEnd),
        db.tag.listByOffice(profile.id, 'consultant'),
      ]);

      setConsultants(pageResult.rows);
      setTotal(pageResult.total);
      setOfficeTags(tags);
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
    debouncedSearch,
    statusFilter,
    tagFilterIds,
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
  }, [debouncedSearch, statusFilter, tagFilterIds, pageSize, sortKey, sortDir]);

  const handleInviteConsultant = async () => {
    if (!inviteEmail || !inviteName || !inviteCode) {
      setInviteError('Por favor completa todos los campos');
      return;
    }

    setIsInviting(true);
    setInviteError('');

    try {
      // Call API to create token and send email
      const response = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId: profile?.id,
          consultantEmail: inviteEmail,
          consultantName: inviteName,
          consultantCode: inviteCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Error al enviar la invitación');
      }

      setInviteSuccess(`Invitación enviada exitosamente a ${inviteEmail}. El asesor recibirá un correo electrónico con el enlace de registro.`);

      // Reset form
      setInviteEmail('');
      setInviteName('');
      setInviteCode('');
      setInviteError('');

      // Close dialog and reload after a short delay to show success message
      setTimeout(() => {
        setIsDialogOpen(false);
        setInviteSuccess('');
        loadConsultants();
      }, 2000);
    } catch (error: any) {
      console.error('Error inviting consultant:', error);
      setInviteError(error.message || 'Error al invitar al asesor. Por favor intenta de nuevo.');
    } finally {
      setIsInviting(false);
    }
  };

  const openRequestDialog = (consultant: Consultant) => {
    setSelectedConsultant(consultant);
    setIsDialogOpen(true);
  };

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
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudo eliminar el asesor.');
      }
      const contracts = Number(data.deletedContracts ?? 0);
      toast.success(
        contracts > 0
          ? `Asesor eliminado (${contracts} póliza${contracts === 1 ? '' : 's'} asociada${contracts === 1 ? '' : 's'}).`
          : 'Asesor eliminado.',
      );
      setConsultantToDelete(null);
      await loadConsultants();
    } catch (error: unknown) {
      console.error('Error deleting consultant:', error);
      toast.error(
        error instanceof Error ? error.message : 'Error al eliminar el asesor',
      );
    } finally {
      setDeletingId(null);
    }
  };

  const deleteDialogLabel =
    consultantToDelete?.name?.trim() ||
    consultantToDelete?.consultant_code?.trim() ||
    'este asesor';

  const closeDialog = () => {
    setIsDialogOpen(false);
    setSelectedConsultant(null);
    setInviteError('');
    setInviteSuccess('');
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
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">
          Asesores
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Gestiona tus asesores. Ventas filtradas por fecha de pago (período).
        </p>
      </div>
      <div className="flex justify-end mb-6">
        <button
          onClick={() => {
            setInviteEmail('');
            setInviteName('');
            setInviteCode('');
            setInviteError('');
            setInviteSuccess('');
            setSelectedConsultant(null);
            setIsDialogOpen(true);
          }}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          + Invitar Asesor
        </button>
      </div>

      {loadError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 dark:text-red-200">{loadError}</p>
        </div>
      )}

      {/* Consultants List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Buscar
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Nombre, código o correo..."
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <div className="min-w-[160px]">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="PENDING">Pendiente</option>
              <option value="INACTIVE">Inactivo</option>
            </select>
          </div>
          <TagMultiFilter
            tags={officeTags}
            selectedIds={tagFilterIds}
            onChange={setTagFilterIds}
          />
        </div>
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
              <th className={`${TH} text-xs font-medium uppercase tracking-wider`}>
                Etiquetas
              </th>
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
                    <td colSpan={8} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                      {total === 0
                        ? 'No hay asesores registrados. Invita uno para comenzar.'
                        : 'No hay asesores que coincidan con los filtros.'}
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
                  <td className="px-6 py-4 text-sm" onClick={(e) => e.stopPropagation()}>
                    <TagChips tags={consultant.tags} />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                    ${(salesByConsultant[consultant.id] ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {consultant.created_at
                      ? new Date(consultant.created_at).toLocaleDateString('en-US')
                      : '-'}
                  </td>
                  <td
                    className={`${ACTIONS_TD} group-hover:bg-gray-50 dark:group-hover:bg-gray-700`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex justify-end items-center gap-3 flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setTagsEditorFor(consultant)}
                        className="text-[#FBDBAC] hover:text-[#f5c98a]"
                      >
                        Etiquetas
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                      >
                        Ver Detalles
                      </button>
                      <button
                        type="button"
                        onClick={() => openRequestDialog(consultant)}
                        className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300"
                      >
                        Nueva Solicitud
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === consultant.id}
                        onClick={() => openDeleteDialog(consultant)}
                        className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-50"
                        aria-label={`Eliminar asesor ${consultant.name || consultant.consultant_code || ''}`}
                      >
                        {deletingId === consultant.id ? 'Eliminando…' : 'Eliminar'}
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
        title="Eliminar asesor"
        description={`¿Eliminar a ${deleteDialogLabel}?\n\nTambién se eliminarán sus pólizas, detalles y datos de cobranza asociados. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        loadingLabel="Eliminando…"
        loading={deletingId != null && deletingId === consultantToDelete?.id}
        onConfirm={() => void confirmDeleteConsultant()}
        onCancel={closeDeleteDialog}
      />

      {tagsEditorFor && profile?.id && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="consultant-tags-title"
          onClick={() => setTagsEditorFor(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white dark:bg-gray-800 shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="consultant-tags-title"
              className="text-lg font-semibold text-gray-900 dark:text-white mb-1"
            >
              Etiquetas
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {tagsEditorFor.name}
            </p>
            <ConsultantTagsEditor
              officeId={profile.id}
              consultantId={tagsEditorFor.id}
              initialTagIds={tagsEditorFor.tags.map((t) => t.id)}
              onCancel={() => setTagsEditorFor(null)}
              onSaved={(tags) => {
                setConsultants((prev) =>
                  prev.map((c) => (c.id === tagsEditorFor.id ? { ...c, tags } : c)),
                );
                setOfficeTags((prev) => {
                  const byId = new Map(prev.map((t) => [t.id, t]));
                  for (const t of tags) byId.set(t.id, t);
                  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
                });
                setTagsEditorFor(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Invite/Request Dialog */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-[#3a4049] bg-[#242830] shadow-2xl">
            <div className="p-6">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h2 className="dashboard-page-title text-2xl font-bold">
                    {selectedConsultant ? 'Nueva Solicitud' : 'Invitar Asesor'}
                  </h2>
                  {selectedConsultant && (
                    <p className="mt-1 text-sm text-[#9ca3af]">
                      Completa los datos y adjunta documentos si los necesitas.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeDialog}
                  aria-label="Cerrar"
                  className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#1a1d23] hover:text-[#FBDBAC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {selectedConsultant ? (
                <RequestFormDialog consultant={selectedConsultant} onClose={closeDialog} />
              ) : (
                <div className="space-y-4">
                  <div>
                    <label htmlFor="invite-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre del Asesor *
                    </label>
                    <input
                      id="invite-name"
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Nombre completo"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Correo Electrónico *
                    </label>
                    <input
                      id="invite-email"
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="invite-code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Código del Asesor *
                    </label>
                    <input
                      id="invite-code"
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="Código único del asesor"
                    />
                  </div>
                  {inviteError && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                      <p className="text-sm text-red-800 dark:text-red-200">{inviteError}</p>
                    </div>
                  )}
                  {inviteSuccess && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                      <p className="text-sm text-green-800 dark:text-green-200">{inviteSuccess}</p>
                    </div>
                  )}
                  <div className="flex justify-end space-x-4">
                    <button
                      onClick={closeDialog}
                      className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleInviteConsultant}
                      disabled={isInviting}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isInviting ? 'Enviando...' : 'Enviar Invitación'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
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
