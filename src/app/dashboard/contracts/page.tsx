'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ManualContractDialog } from '@/components/contracts/manual-contract-dialog';
import { Button } from '@/components/ui/button';
import { DataTable, dataTablePanelClass } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { AtRiskBadge } from '@/components/collections/at-risk-badge';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import { useQueryEffect, useResetPage } from '@/hooks/use-query-effect';

type ContractRow = Contract & { client_name?: string };
type SortKey = 'client_name' | 'contract_number' | 'issue_date' | 'payment_method';

const SORT_GETTERS: Record<
  SortKey,
  (row: ContractRow) => string | number | Date | null | undefined
> = {
  client_name: (r) => r.client_name,
  contract_number: (r) => r.contract_number,
  issue_date: (r) => r.issue_date,
  payment_method: (r) => r.payment_method,
};

function ContractsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [manualOpen, setManualOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useResetPage(
    `${search}\0${pageSize}\0${sortKey ?? ''}\0${sortDir}`,
  );
  const [total, setTotal] = useState(0);
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

  useQueryEffect(Boolean(profile), loadContracts);

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

      <div className={dataTablePanelClass}>
        <ListSearchFilters
          value={searchDraft}
          onChange={setSearchDraft}
          onSubmit={() => {
            setSearch(searchDraft);
            setPage(1);
          }}
          placeholder="Número de póliza o cliente…"
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
        <DataTable
          rows={displayedContracts}
          getRowKey={(contract) => contract.id}
          onRowClick={(contract) => router.push(`/dashboard/contracts/${contract.id}`)}
          empty={
            total === 0 && !search.trim()
              ? 'Aún no hay pólizas. Registra una o impórtala desde el extractor.'
              : 'No hay pólizas que coincidan con la búsqueda.'
          }
          columns={[
            {
              id: 'contract_number',
              header: 'Número de póliza',
              tone: 'accent',
              sort: {
                label: 'Número de póliza',
                active: sortKey === 'contract_number',
                dir: sortDir,
                onSort: () => toggleSort('contract_number'),
              },
              cell: (contract) => (
                <div className="flex flex-wrap items-center gap-2">
                  <span>{contract.contract_number || '—'}</span>
                  {atRiskById[contract.id] != null ? (
                    <AtRiskBadge daysOverdue={atRiskById[contract.id]} />
                  ) : null}
                </div>
              ),
            },
            {
              id: 'issue_date',
              header: 'Fecha de emisión',
              tone: 'muted',
              sort: {
                label: 'Fecha de emisión',
                active: sortKey === 'issue_date',
                dir: sortDir,
                onSort: () => toggleSort('issue_date'),
              },
              cell: (contract) => formatDateShortEsLocal(contract.issue_date),
            },
            {
              id: 'client_name',
              header: 'Cliente',
              sort: {
                label: 'Cliente',
                active: sortKey === 'client_name',
                dir: sortDir,
                onSort: () => toggleSort('client_name'),
              },
              cell: (contract) => contract.client_name || '—',
            },
            {
              id: 'payment_method',
              header: 'Forma de pago',
              tone: 'muted',
              sort: {
                label: 'Forma de pago',
                active: sortKey === 'payment_method',
                dir: sortDir,
                onSort: () => toggleSort('payment_method'),
              },
              cell: (contract) => contract.payment_method || '—',
            },
            {
              id: 'actions',
              header: 'Acciones',
              align: 'right',
              sticky: true,
              cell: (contract) => (
                <button
                  type="button"
                  onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
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
