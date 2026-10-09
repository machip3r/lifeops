'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Client, Contract, Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  DetailCard,
  DetailField,
  DetailGrid,
} from '@/components/dashboard/detail-card';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';

type SortKey = 'contract_number' | 'consultant' | 'payment_method';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

function ClientDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;
  const { toast } = useToast();
  const [client, setClient] = useState<Client | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractsTotal, setContractsTotal] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [consultantsMap, setConsultantsMap] = useState<Map<string, Consultant>>(
    new Map(),
  );
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useResetPage(`${pageSize}\0${search}`);
  const [contractsLoading, setContractsLoading] = useQueryLoading(
    `${clientId}\0${page}\0${pageSize}\0${search}`,
  );

  const sortedContracts = useMemo(
    () =>
      sortRows(
        contracts,
        sortKey,
        sortDir,
        {
          contract_number: (c) => c.contract_number,
          consultant: (c) => consultantsMap.get(c.consultant_id)?.name,
          payment_method: (c) => c.payment_method,
        },
      ),
    [contracts, sortKey, sortDir, consultantsMap],
  );

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  const loadClientData = useCallback(async () => {
    try {
      const [clientData, contractsPage] = await Promise.all([
        db.client.getClientById(clientId),
        db.contract.getContractsWithClientsPage({
          clientId,
          search: search || undefined,
          page,
          pageSize,
        }),
      ]);

      if (!clientData) {
        throw new Error('Cliente no encontrado');
      }

      const contractsData = contractsPage.rows;
      setClient(clientData);
      setContracts(contractsData);
      setContractsTotal(contractsPage.total);

      const consultantIds = [
        ...new Set(
          contractsData
            .map((c) => c.consultant_id)
            .filter((id): id is string => !!id),
        ),
      ];
      const nextConsultantsMap = new Map<string, Consultant>();

      for (const consultantId of consultantIds) {
        try {
          const consultant = await db.consultant.getConsultantById(consultantId);
          if (consultant) {
            nextConsultantsMap.set(consultantId, consultant);
          }
        } catch (error) {
          console.error(`Error loading consultant ${consultantId}:`, error);
        }
      }

      setConsultantsMap(nextConsultantsMap);
    } catch (error: unknown) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
      setContractsLoading(false);
    }
  }, [clientId, page, pageSize, search, setContractsLoading]);

  useQueryEffect(Boolean(clientId), loadClientData);

  const calculateAge = (birthDate: string | null | undefined) => {
    if (!birthDate) return null;
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (
        monthDiff < 0 ||
        (monthDiff === 0 && today.getDate() < birth.getDate())
      ) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
            Cliente no encontrado
          </p>
          <button
            type="button"
            onClick={() => router.push('/dashboard/clients')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Volver a Clientes
          </button>
        </div>
      </div>
    );
  }

  const age = calculateAge(client.birth_date);

  return (
    <div>
      <PageHeader
        title={client.name}
        watermark="Cliente"
        eyebrow={
          <button
            type="button"
            onClick={() => router.push('/dashboard/clients')}
            className="inline-flex items-center text-[#FBDBAC] hover:underline"
          >
            ← Volver a clientes
          </button>
        }
        description="Detalles del cliente"
      />

      <DetailCard
        title="Información"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            Editar
          </Button>
        }
      >
        <DetailGrid>
          <DetailField label="Nombre">{client.name}</DetailField>
          <DetailField label="Nacimiento">
            {client.birth_date
              ? `${formatDateShortEsLocal(client.birth_date)}${age !== null ? ` · ${age} años` : ''}`
              : '—'}
          </DetailField>
          <DetailField label="Pólizas">{contractsTotal}</DetailField>
        </DetailGrid>
      </DetailCard>

      <ClientFormDialog
        open={editOpen}
        editingClient={client}
        onClose={() => setEditOpen(false)}
        onSubmit={async (data) => {
          const updated = await db.client.updateClient(client.id, {
            name: data.name,
            birth_date: data.date_of_birth || null,
            curp: data.curp,
            rfc: data.rfc,
          });
          setClient(updated);
          setEditOpen(false);
          toast.success('Cliente actualizado.');
        }}
      />

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
            placeholder="Número de póliza…"
            id="client-contracts-search"
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
                      label="Asesor"
                      active={sortKey === 'consultant'}
                      dir={sortDir}
                      onSort={() => toggleSort('consultant')}
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
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {contract.contract_number || '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {contract.consultant_id &&
                            consultantsMap.has(contract.consultant_id)
                            ? consultantsMap.get(contract.consultant_id)?.name ||
                            '—'
                            : contract.consultant_id
                              ? 'Cargando...'
                              : '—'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                          {contract.payment_method || '—'}
                        </div>
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
                : 'Este cliente no tiene pólizas registradas'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant', 'promotory']}>
      <ClientDetailsPageContent />
    </ProtectedRoute>
  );
}
