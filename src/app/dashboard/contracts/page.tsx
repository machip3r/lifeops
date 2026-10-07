'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ManualContractDialog } from '@/components/contracts/manual-contract-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { AtRiskBadge } from '@/components/collections/at-risk-badge';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { PageHeader } from '@/components/dashboard/page-header';

type ContractRow = Contract & { client_name?: string };
type SortKey = 'client_name' | 'contract_number' | 'project_name' | 'payment_method' | 'capture_date';

const SORT_GETTERS: Record<
  SortKey,
  (row: ContractRow) => string | number | Date | null | undefined
> = {
  client_name: (r) => r.client_name,
  contract_number: (r) => r.contract_number,
  project_name: (r) => r.project_name,
  payment_method: (r) => r.payment_method,
  capture_date: (r) => r.capture_date || r.created_at,
};

const TH = 'px-6 py-3 text-gray-500 dark:text-gray-400';
const ACTIONS_TH =
  'px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';
const ACTIONS_TD =
  'px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';

function ContractsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [atRiskById, setAtRiskById] = useState<Record<string, number>>({});

  const loadContracts = useCallback(async () => {
    try {
      if (!profile?.id) return;

      const dbSort =
        sortKey && sortKey !== 'client_name'
          ? { column: sortKey, ascending: sortDir === 'asc' }
          : undefined;

      const [result, atRiskRows] = await Promise.all([
        db.contract.getContractsWithClientsPage({
          consultantId: profile.role === 'consultant' ? profile.id : undefined,
          officeId: profile.role === 'promotory' ? profile.id : undefined,
          search: search || undefined,
          sort: dbSort,
          page,
          pageSize,
        }),
        db.dashboard.listContractsAtRisk({
          consultantId: profile.role === 'consultant' ? profile.id : undefined,
          officeId: profile.role === 'promotory' ? profile.id : undefined,
          riskDays: POLICY_AT_RISK_DAYS,
        }),
      ]);

      setContracts(result.rows);
      setTotal(result.total);
      const map: Record<string, number> = {};
      for (const row of atRiskRows) {
        map[row.contract_id] = row.days_overdue;
      }
      setAtRiskById(map);
    } catch (error) {
      console.error('Error loading contracts:', error);
    } finally {
      setLoading(false);
    }
  }, [profile, page, pageSize, search, sortKey, sortDir]);

  useEffect(() => {
    if (profile) void loadContracts();
  }, [profile, loadContracts]);

  useEffect(() => {
    setPage(1);
  }, [search, pageSize, sortKey, sortDir]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta póliza?')) return;
    try {
      await db.contract.deleteContract(id);
      void loadContracts();
    } catch (error) {
      console.error('Error deleting contract:', error);
      toast.error('No se pudo eliminar la póliza');
    }
  };

  const displayedContracts = useMemo(() => {
    if (sortKey === 'client_name') {
      return sortRows(contracts, sortKey, sortDir, SORT_GETTERS);
    }
    return contracts;
  }, [contracts, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Pólizas"
        watermark="Pólizas"
        description={
          profile?.role === 'promotory'
            ? 'Gestiona las pólizas de tus asesores'
            : 'Gestiona tus pólizas'
        }
      />

      <ManualContractDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setLoading(true);
          void loadContracts();
        }}
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <ListSearchFilters
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={() => {
            setSearch(searchDraft);
            setPage(1);
          }}
          placeholder="Número de póliza, cliente o proyecto…"
          id="contracts-search"
          actions={
            <Button
              type="button"
              variant="brand"
              size="lg"
              onClick={() => setManualOpen(true)}
            >
              Registrar póliza
            </Button>
          }
        />
        {displayedContracts.length === 0 ? (
          <div className="flex w-full items-center justify-center px-6 py-12 text-center text-gray-500 dark:text-gray-400">
            <p>
              {total === 0 && !search.trim()
                ? 'Aún no hay pólizas. Registra una o impórtala desde el extractor.'
                : 'No hay pólizas que coincidan con la búsqueda.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-900">
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
                    active={sortKey === 'capture_date'}
                    dir={sortDir}
                    onSort={() => toggleSort('capture_date')}
                    className={TH}
                  />
                  <th className={ACTIONS_TH}>Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {displayedContracts.map((contract) => (
                  <tr
                    key={contract.id}
                    onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                      {contract.client_name || '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{contract.contract_number || '—'}</span>
                        {atRiskById[contract.id] != null ? (
                          <AtRiskBadge daysOverdue={atRiskById[contract.id]} />
                        ) : null}
                      </div>
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
                      className={`${ACTIONS_TD} group-hover:bg-gray-50 dark:group-hover:bg-gray-700`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex justify-end items-center gap-3 flex-nowrap">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/dashboard/contracts/${contract.id}`)
                          }
                          className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                        >
                          Ver
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(contract.id)}
                          className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
    </div>
  );
}

export default function ContractsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ContractsPageContent />
    </ProtectedRoute>
  );
}
