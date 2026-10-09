'use client';

import { useState, useCallback, useMemo } from 'react';
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
import { PageHeader } from '@/components/dashboard/page-header';
import {
  DetailCard,
  DetailField,
  DetailGrid,
} from '@/components/dashboard/detail-card';
import { EditConsultantDialog } from '@/components/consultants/edit-consultant-dialog';
import { Button } from '@/components/ui/button';
import {
  CONSULTANT_STATUS_LABEL,
  consultantStatusClass,
} from '@/lib/consultants/status';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';

type ContractRow = Contract & { client_name?: string };
type SortKey = 'contract_number' | 'client_name' | 'payment_method';

const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

function ConsultantDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const consultantId = params.id as string;
  const { profile } = useAuth();
  const [consultant, setConsultant] = useState<Consultant | null>(null);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsTotal, setContractsTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [loading, setLoading] = useQueryLoading(consultantId);
  const [editOpen, setEditOpen] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useResetPage(`${pageSize}\0${search}`);
  const [contractsLoading, setContractsLoading] = useQueryLoading(
    `${consultantId}\0${page}\0${pageSize}\0${search}`,
  );
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sortedContracts = useMemo(
    () =>
      sortRows(
        contracts,
        sortKey,
        sortDir,
        {
          contract_number: (c) => c.contract_number,
          client_name: (c) => c.client_name,
          payment_method: (c) => c.payment_method,
        },
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
  }, [consultantId, page, pageSize, search, setContractsLoading]);

  const loadConsultantData = useCallback(async () => {
    try {
      const consultantData = await db.consultant.getConsultantById(consultantId);
      if (!consultantData) {
        throw new Error('Asesor no encontrado');
      }
      setConsultant(consultantData);
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
  }, [consultantId, setLoading]);

  useQueryEffect(Boolean(consultantId), loadConsultantData);
  useQueryEffect(Boolean(consultantId), loadContractsPage);

  const handleSendInvitation = async () => {
    if (!consultant || !profile?.id) return;
    if (!consultant.email?.trim()) {
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
          consultantEmail: consultant.email.trim().toLowerCase(),
          consultantName: (consultant.name || consultant.consultant_code || '').trim(),
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
        email: consultant.email.trim().toLowerCase(),
        name: consultant.name,
        status: 'PENDING',
        auth_user_id: null,
      });
      setSuccess(
        `Invitación enviada a ${consultant.email}. El registro se reinició para que pueda aceptar el enlace.`,
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
      <PageHeader
        title={consultant.name}
        watermark="Asesor"
        eyebrow={
          <button
            type="button"
            onClick={() => router.push('/dashboard/consultants')}
            className="inline-flex items-center text-[#FBDBAC] hover:underline"
          >
            ← Volver a asesores
          </button>
        }
        description="Detalles del asesor"
      />

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

      <DetailCard
        title="Información"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setEditOpen(true)}
            >
              Editar
            </Button>
            {consultant.status !== 'ACTIVE' ? (
              <Button
                type="button"
                variant="brand"
                size="sm"
                onClick={() => void handleSendInvitation()}
                disabled={isSendingInvite || !consultant.email?.trim()}
              >
                {isSendingInvite
                  ? 'Enviando…'
                  : consultant.status === 'PENDING'
                    ? 'Reenviar invitación'
                    : 'Invitar'}
              </Button>
            ) : null}
          </>
        }
      >
        <DetailGrid>
          <DetailField label="Código">
            <span className="font-mono">
              {consultant.consultant_code || '—'}
            </span>
          </DetailField>
          <DetailField label="Correo">
            {consultant.email || 'Sin correo'}
          </DetailField>
          <DetailField label="Estado">
            <span
              className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${consultantStatusClass(consultant.status)}`}
            >
              {CONSULTANT_STATUS_LABEL[consultant.status] ?? consultant.status}
            </span>
          </DetailField>
          <DetailField label="Pólizas">{contractsTotal}</DetailField>
        </DetailGrid>
      </DetailCard>

      {profile?.id ? (
        <EditConsultantDialog
          open={editOpen}
          consultant={consultant}
          officeId={profile.id}
          onClose={() => setEditOpen(false)}
          onSaved={(next) => {
            setConsultant({ ...consultant, ...next });
            setSuccess('Información actualizada');
            setTimeout(() => setSuccess(''), 3000);
          }}
        />
      ) : null}

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
            placeholder="Número de póliza o cliente…"
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
                      label="Número de póliza"
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
                      label="Forma de pago"
                      active={sortKey === 'payment_method'}
                      dir={sortDir}
                      onSort={() => toggleSort('payment_method')}
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
                        {contract.contract_number || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {contract.client_name || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {contract.payment_method || '—'}
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
