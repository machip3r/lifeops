'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { useToast } from '@/components/toast';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';

type ClientRow = Client & { contract_count?: number };
type SortKey = 'name' | 'birth_date' | 'age' | 'contracts' | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-400';
const ACTIONS_TH =
  'px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider sticky right-0 bg-gray-50 dark:bg-gray-900 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';
const ACTIONS_TD =
  'px-6 py-4 whitespace-nowrap text-right text-sm font-medium sticky right-0 bg-white dark:bg-gray-800 z-10 shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.35)]';

function ClientsPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const { toast } = useToast();
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [showForm, setShowForm] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [draftSearch, setDraftSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);

  const loadClients = useCallback(async () => {
    try {
      if (!profile?.id) return;
      const dbSort =
        sortKey && sortKey !== 'age' && sortKey !== 'contracts'
          ? { column: sortKey, ascending: sortDir === 'asc' }
          : undefined;

      const result = await db.client.getClientsPage({
        page,
        pageSize,
        search: appliedSearch.trim(),
        sort: dbSort,
        officeId: profile.role === 'promotory' ? profile.id : undefined,
        consultantId: profile.role === 'consultant' ? profile.id : undefined,
      });
      setClients(result.rows);
      setTotal(result.total);
    } catch (error) {
      console.error('Error loading clients:', error);
    } finally {
      setLoading(false);
    }
  }, [profile, page, pageSize, appliedSearch, sortKey, sortDir]);

  useEffect(() => {
    if (profile && (profile.role === 'consultant' || profile.role === 'promotory')) {
      loadClients();
    }
  }, [profile, loadClients]);

  useEffect(() => {
    setPage(1);
  }, [appliedSearch, pageSize, sortKey, sortDir]);

  const getContractCount = (client: ClientRow) => client.contract_count ?? 0;

  const openNewClient = () => {
    setEditingClient(null);
    setShowForm(true);
  };

  const handleSubmit = async (data: {
    name: string;
    date_of_birth: string;
    curp: string | null;
    rfc: string | null;
  }) => {
    try {
      if (editingClient) {
        await db.client.updateClient(editingClient.id, {
          name: data.name,
          birth_date: data.date_of_birth || null,
          curp: data.curp,
          rfc: data.rfc,
        });
        toast.success('Cliente actualizado.');
      } else {
        const officeId =
          profile?.role === 'promotory' ? profile?.id : profile?.office_id;
        await db.client.findOrCreateClient({
          name: data.name,
          birthDate: data.date_of_birth || null,
          officeId: officeId ?? null,
          curp: data.curp,
          rfc: data.rfc,
        });
        toast.success('Cliente creado.');
      }

      setShowForm(false);
      setEditingClient(null);
      await loadClients();
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

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este cliente?')) return;

    try {
      await db.client.deleteClient(id);
      loadClients();
    } catch (error) {
      console.error('Error deleting client:', error);
      toast.error('Error al eliminar el cliente');
    }
  };

  const calculateAge = (birthDate: string | null | undefined) => {
    if (!birthDate) return null;
    try {
      const birth = new Date(birthDate);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age;
    } catch {
      return null;
    }
  };

  const sortedClients = useMemo(
    () =>
      sortRows(
        clients,
        sortKey,
        sortDir,
        {
          name: (c) => c.name,
          birth_date: (c) => c.birth_date,
          age: (c) => calculateAge(c.birth_date),
          contracts: (c) => getContractCount(c),
          created_at: (c) => c.created_at,
        },
        {
          age: 'number',
          contracts: 'number',
          birth_date: 'date',
          created_at: 'date',
        },
      ),
    [clients, sortKey, sortDir],
  );

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
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">Clientes</h1>
        <p className="text-gray-600 dark:text-gray-400">Gestiona tus clientes registrados</p>
      </div>

      <ClientFormDialog
        open={showForm}
        editingClient={editingClient}
        onClose={() => {
          setShowForm(false);
          setEditingClient(null);
        }}
        onSubmit={handleSubmit}
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        <ListSearchFilters
          value={draftSearch}
          onChange={setDraftSearch}
          onSubmit={() => {
            setAppliedSearch(draftSearch);
            setPage(1);
          }}
          placeholder="Nombre del cliente…"
          id="clients-search"
          actions={
            <Button type="button" variant="brand" size="lg" onClick={openNewClient}>
              Nuevo cliente
            </Button>
          }
        />
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <SortableTh
                  label="Nombre"
                  active={sortKey === 'name'}
                  dir={sortDir}
                  onSort={() => toggleSort('name')}
                  className={TH}
                />
                <th className={TH}>CURP / RFC</th>
                <SortableTh
                  label="Fecha de Nacimiento"
                  active={sortKey === 'birth_date'}
                  dir={sortDir}
                  onSort={() => toggleSort('birth_date')}
                  className={TH}
                />
                <SortableTh
                  label="Edad"
                  active={sortKey === 'age'}
                  dir={sortDir}
                  onSort={() => toggleSort('age')}
                  className={TH}
                />
                <SortableTh
                  label="Pólizas"
                  active={sortKey === 'contracts'}
                  dir={sortDir}
                  onSort={() => toggleSort('contracts')}
                  className={TH}
                />
                <SortableTh
                  label="Fecha de registro"
                  active={sortKey === 'created_at'}
                  dir={sortDir}
                  onSort={() => toggleSort('created_at')}
                  className={TH}
                />
                <th className={ACTIONS_TH}>Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {sortedClients.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                    {total === 0 && !appliedSearch.trim()
                      ? 'Aún no hay clientes registrados.'
                      : 'No hay clientes que coincidan con la búsqueda.'}
                  </td>
                </tr>
              ) : (
                sortedClients.map((client) => {
                  const age = calculateAge(client.birth_date);
                  const identity = client.curp || client.rfc || '—';
                  return (
                    <tr
                      key={client.id}
                      onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                      className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group"
                    >
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        {client.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {identity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDateShortEsLocal(client.birth_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {age !== null ? `${age} años` : 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {getContractCount(client)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDateShortEsLocal(client.created_at)}
                      </td>
                      <td
                        className={`${ACTIONS_TD} group-hover:bg-gray-50 dark:group-hover:bg-gray-700`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex justify-end items-center gap-3 flex-nowrap">
                          <button
                            type="button"
                            onClick={() => handleEdit(client)}
                            className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(client.id)}
                            className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
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
