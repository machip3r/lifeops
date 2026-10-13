'use client';

import { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { useToast } from '@/components/toast';
import { DataTable, dataTablePanelClass } from '@/components/data-table';
import { TablePagination } from '@/components/table-pagination';
import { ListSearchFilters } from '@/components/list-search-filters';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';
import { Button } from '@/components/ui/button';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { PageHeader } from '@/components/dashboard/page-header';
import { useQueryEffect, useResetPage } from '@/hooks/use-query-effect';

type ClientRow = Client & { contract_count?: number };
type SortKey = 'name' | 'curp_rfc' | 'birth_date' | 'age' | 'contracts' | 'created_at';

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
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useResetPage(
    `${appliedSearch}\0${pageSize}\0${sortKey ?? ''}\0${sortDir}`,
  );
  const [total, setTotal] = useState(0);

  const loadClients = useCallback(async () => {
    try {
      if (!profile?.id) return;
      const dbSort =
        sortKey && sortKey !== 'age' && sortKey !== 'contracts' && sortKey !== 'curp_rfc'
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

  useQueryEffect(
    Boolean(profile && (profile.role === 'consultant' || profile.role === 'promotory')),
    loadClients,
  );

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
          curp_rfc: (c) => c.curp || c.rfc,
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
      <PageHeader
        title="Clientes"
        watermark="Clientes"
        description="Gestiona tus clientes registrados"
      />

      <ClientFormDialog
        open={showForm}
        editingClient={editingClient}
        onClose={() => {
          setShowForm(false);
          setEditingClient(null);
        }}
        onSubmit={handleSubmit}
      />

      <div className={dataTablePanelClass}>
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
        <DataTable
          rows={sortedClients}
          getRowKey={(client) => client.id}
          onRowClick={(client) => router.push(`/dashboard/clients/${client.id}`)}
          empty={
            total === 0 && !appliedSearch.trim()
              ? 'Aún no hay clientes registrados.'
              : 'No hay clientes que coincidan con la búsqueda.'
          }
          columns={[
            {
              id: 'name',
              header: 'Nombre',
              tone: 'accent',
              sort: {
                label: 'Nombre',
                active: sortKey === 'name',
                dir: sortDir,
                onSort: () => toggleSort('name'),
              },
              cell: (client) => client.name,
            },
            {
              id: 'curp_rfc',
              header: 'CURP / RFC',
              tone: 'muted',
              className: 'font-mono text-xs',
              sort: {
                label: 'CURP / RFC',
                active: sortKey === 'curp_rfc',
                dir: sortDir,
                onSort: () => toggleSort('curp_rfc'),
              },
              cell: (client) => client.curp || client.rfc || '—',
            },
            {
              id: 'birth_date',
              header: 'Fecha de Nacimiento',
              tone: 'muted',
              sort: {
                label: 'Fecha de Nacimiento',
                active: sortKey === 'birth_date',
                dir: sortDir,
                onSort: () => toggleSort('birth_date'),
              },
              cell: (client) => formatDateShortEsLocal(client.birth_date),
            },
            {
              id: 'age',
              header: 'Edad',
              tone: 'muted',
              sort: {
                label: 'Edad',
                active: sortKey === 'age',
                dir: sortDir,
                onSort: () => toggleSort('age'),
              },
              cell: (client) => {
                const age = calculateAge(client.birth_date);
                return age !== null ? `${age} años` : 'N/A';
              },
            },
            {
              id: 'contracts',
              header: 'Pólizas',
              tone: 'muted',
              sort: {
                label: 'Pólizas',
                active: sortKey === 'contracts',
                dir: sortDir,
                onSort: () => toggleSort('contracts'),
              },
              cell: (client) => getContractCount(client),
            },
            {
              id: 'created_at',
              header: 'Fecha de registro',
              tone: 'muted',
              sort: {
                label: 'Fecha de registro',
                active: sortKey === 'created_at',
                dir: sortDir,
                onSort: () => toggleSort('created_at'),
              },
              cell: (client) => formatDateShortEsLocal(client.created_at),
            },
            {
              id: 'actions',
              header: 'Acciones',
              align: 'right',
              sticky: true,
              cell: (client) => (
                <div className="flex flex-nowrap items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => handleEdit(client)}
                    className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(client.id)}
                    className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                  >
                    Eliminar
                  </button>
                </div>
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

export default function ClientsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ClientsPageContent />
    </ProtectedRoute>
  );
}
