'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Consultant, Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';

type ContractRow = Contract & { client_name?: string };
type SortKey = 'client_name' | 'contract_number' | 'project_name' | 'payment_method' | 'created_at';

const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

function ConsultantDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const consultantId = params.id as string;
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<Consultant | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsTotal, setContractsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedContracts = useMemo(
    () =>
      sortRows(
        contracts,
        sortKey,
        sortDir,
        {
          client_name: (c) => c.client_name,
          contract_number: (c) => c.contract_number,
          project_name: (c) => c.project_name,
          payment_method: (c) => c.payment_method,
          created_at: (c) => c.created_at,
        },
        { created_at: 'date' },
      ),
    [contracts, sortKey, sortDir],
  );

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  const loadContractsPage = useCallback(async () => {
    try {
      setContractsLoading(true);
      const result = await db.contract.getContractsWithClientsPage({
        consultantId,
        search: search || undefined,
        page,
        pageSize,
      });
      setContracts(result.rows);
      setContractsTotal(result.total);
    } catch (err: unknown) {
      console.error('Error loading consultant contracts page:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar las pólizas del asesor',
      );
    } finally {
      setContractsLoading(false);
    }
  }, [consultantId, page, pageSize, search]);

  const loadConsultantData = useCallback(async () => {
    try {
      setLoading(true);
      const consultantData = await db.consultant.getConsultantById(consultantId);
      if (!consultantData) {
        throw new Error('Asesor no encontrado');
      }
      setConsultant(consultantData);
      setEditName(consultantData.name);
      setEditEmail(consultantData.email || '');
    } catch (err: unknown) {
      console.error('Error loading consultant data:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Error al cargar los datos del asesor',
      );
    } finally {
      setLoading(false);
    }
  }, [consultantId]);

  useEffect(() => {
    if (consultantId) void loadConsultantData();
  }, [consultantId, loadConsultantData]);

  useEffect(() => {
    if (consultantId) void loadContractsPage();
  }, [consultantId, loadContractsPage]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, search]);

  const handleSave = async () => {
    if (!consultant) return;
    setIsSaving(true);
    setError('');
    setSuccess('');
    try {
      await authFetch('/api/consultants/update', {
        method: 'POST',
        body: JSON.stringify({
          consultantId: consultant.id,
          officeId: profile?.id,
          updates: {
            name: editName,
            email: editEmail || null,
          },
        }),
      }).then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          const fieldMsg =
            data.fieldErrors?.name ||
            data.fieldErrors?.email ||
            data.fieldErrors?.consultantId ||
            data.fieldErrors?.officeId;
          throw new Error(
            fieldMsg || data.error || 'Error al actualizar la información',
          );
        }
      });
      setConsultant({ ...consultant, name: editName, email: editEmail || null });
      setSuccess('Información actualizada');
      setIsEditing(false);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err: unknown) {
      console.error('Error updating consultant:', err);
      setError(
        err instanceof Error ? err.message : 'Error al actualizar la información',
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvitation = async () => {
    if (!consultant || !profile?.id) return;
    if (!editEmail) {
      setError('El correo es requerido para enviar la invitación');
      return;
    }
    setIsSendingInvite(true);
    setError('');
    setSuccess('');
    try {
      const response = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId: profile.id,
          consultantId: consultant.id,
          consultantEmail: editEmail.trim().toLowerCase(),
          consultantName: (editName || consultant.name || consultant.consultant_code || '').trim(),
          consultantCode: (consultant.consultant_code || '').trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const fieldMsg =
          data.fieldErrors?.consultantEmail ||
          data.fieldErrors?.consultantName ||
          data.fieldErrors?.consultantCode ||
          data.fieldErrors?.consultantId;
        throw new Error(fieldMsg || data.error || 'Error al enviar la invitación');
      }
      setConsultant({
        ...consultant,
        email: editEmail.trim().toLowerCase(),
        name: editName,
        status: 'PENDING',
        auth_user_id: null,
      });
      setSuccess(
        `Invitación enviada a ${editEmail}. El registro se reinició para que pueda aceptar el enlace.`,
      );
      setTimeout(() => setSuccess(''), 4000);
    } catch (err: unknown) {
      console.error('Error sending invitation:', err);
      setError(
        err instanceof Error ? err.message : 'Error al enviar la invitación',
      );
    } finally {
      setIsSendingInvite(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!consultant) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Asesor no encontrado
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/consultants')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Volver a Asesores
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <button
            type="button"
            onClick={() => router.push('/dashboard/consultants')}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mb-2 inline-flex items-center"
          >
            ← Volver a Asesores
          </button>
          <h1 className="dashboard-page-title text-4xl font-bold">
            Detalles del Asesor
          </h1>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
        </div>
      )}

      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
          <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Información del Asesor
          </h2>
          {!isEditing && (
            <button
              type="button"
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
            >
              Editar
            </button>
          )}
        </div>

        {isEditing ? (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="consultant-edit-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Nombre
              </label>
              <input
                id="consultant-edit-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="consultant-edit-email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
              >
                Correo electrónico
              </label>
              <input
                id="consultant-edit-email"
                type="email"
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditName(consultant.name);
                  setEditEmail(consultant.email || '');
                  setError('');
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Nombre
              </span>
              <p className="text-sm text-gray-900 dark:text-white">
                {consultant.name}
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Correo electrónico
              </span>
              <p className="text-sm text-gray-900 dark:text-white">
                {consultant.email || 'No establecido'}
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Código
              </span>
              <p className="text-sm text-gray-900 dark:text-white">
                {consultant.consultant_code || 'No establecido'}
              </p>
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Estado
              </span>
              <span
                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                  consultant.status === 'ACTIVE'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : consultant.status === 'PENDING'
                      ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                }`}
              >
                {consultant.status === 'ACTIVE'
                  ? 'Activo'
                  : consultant.status === 'PENDING'
                    ? 'Pendiente'
                    : 'Inactivo'}
              </span>
            </div>
            <div>
              <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                Fecha de registro
              </span>
              <p className="text-sm text-gray-900 dark:text-white">
                {formatDateShortEsLocal(consultant.created_at)}
              </p>
            </div>
            <div>
              <button
                type="button"
                onClick={() => void handleSendInvitation()}
                disabled={isSendingInvite || !editEmail}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
              >
                {isSendingInvite
                  ? 'Enviando...'
                  : 'Enviar invitación por correo'}
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Pólizas ({contractsTotal})
          </h2>
          <ListSearchFilters
            value={searchDraft}
            onChange={setSearchDraft}
            onSubmit={() => {
              setSearch(searchDraft);
              setPage(1);
            }}
            placeholder="Número de póliza, cliente o proyecto…"
            id="consultant-contracts-search"
            className="flex flex-wrap gap-3 items-end p-0 border-0"
          />
        </div>
        {contractsTotal > 0 || contracts.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <SortableTh
                      label="Cliente"
                      active={sortKey === 'client_name'}
                      dir={sortDir}
                      onSort={() => toggleSort('client_name')}
                      className={TH}
                    />
                    <SortableTh
                      label="Número de póliza"
                      active={sortKey === 'contract_number'}
                      dir={sortDir}
                      onSort={() => toggleSort('contract_number')}
                      className={TH}
                    />
                    <SortableTh
                      label="Proyecto"
                      active={sortKey === 'project_name'}
                      dir={sortDir}
                      onSort={() => toggleSort('project_name')}
                      className={TH}
                    />
                    <SortableTh
                      label="Forma de pago"
                      active={sortKey === 'payment_method'}
                      dir={sortDir}
                      onSort={() => toggleSort('payment_method')}
                      className={TH}
                    />
                    <SortableTh
                      label="Fecha"
                      active={sortKey === 'created_at'}
                      dir={sortDir}
                      onSort={() => toggleSort('created_at')}
                      className={TH}
                    />
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedContracts.map((contract) => (
                    <tr
                      key={contract.id}
                      onClick={() =>
                        router.push(`/dashboard/contracts/${contract.id}`)
                      }
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {contract.client_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {contract.contract_number || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {contract.project_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {contract.payment_method || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDateShortEsLocal(
                          contract.capture_date || contract.created_at,
                        )}
                      </td>
                      <td
                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/contracts/${contract.id}`)
                          }
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        >
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={contractsTotal}
              disabled={contractsLoading}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-lg">
              {search.trim()
                ? 'No hay pólizas que coincidan con la búsqueda.'
                : 'No hay pólizas registradas para este asesor'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ConsultantDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory']}>
      <ConsultantDetailsPageContent />
    </ProtectedRoute>
  );
}
