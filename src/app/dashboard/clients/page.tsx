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
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type ClientRow = Client & { contract_count?: number };
type SortKey = 'name' | 'birth_date' | 'age' | 'contracts' | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

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
    const [formData, setFormData] = useState({
        name: '',
        date_of_birth: '',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [search, setSearch] = useState('');
    const [registeredFrom, setRegisteredFrom] = useState('');
    const [registeredTo, setRegisteredTo] = useState('');
    const [minContracts, setMinContracts] = useState('');
    const [appliedSearch, setAppliedSearch] = useState('');
    const [appliedFrom, setAppliedFrom] = useState('');
    const [appliedTo, setAppliedTo] = useState('');
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
                search: appliedSearch,
                registeredFrom: appliedFrom || undefined,
                registeredTo: appliedTo || undefined,
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
    }, [profile, page, pageSize, appliedSearch, appliedFrom, appliedTo, sortKey, sortDir]);

    useEffect(() => {
        if (profile && (profile.role === 'consultant' || profile.role === 'promotory')) {
            loadClients();
        }
    }, [profile, loadClients]);

    useEffect(() => {
        setPage(1);
    }, [appliedSearch, appliedFrom, appliedTo, pageSize, sortKey, sortDir]);

    const getContractCount = (client: ClientRow) => client.contract_count ?? 0;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const resetForm = () => {
        setFormData({
            name: '',
            date_of_birth: '',
        });
        setEditingClient(null);
        setErrorMessage('');
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            if (!formData.name.trim()) {
                throw new Error('El nombre es requerido');
            }

            if (editingClient) {
                // Update
                await db.client.updateClient(editingClient.id, {
                    name: formData.name,
                    birth_date: formData.date_of_birth || null,
                });
            } else {
                const officeId = profile?.role === 'promotory' ? profile?.id : profile?.office_id;
                await db.client.createClient(
                    formData.name,
                    formData.date_of_birth || undefined,
                    officeId ?? undefined
                );
            }

            setShowForm(false);
            resetForm();
            loadClients();
        } catch (error: any) {
            console.error('Error saving client:', error);
            setErrorMessage(error.message || 'Error al guardar el cliente. Por favor, inténtalo de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (client: Client) => {
        setEditingClient(client);
        setFormData({
            name: client.name,
            date_of_birth: client.birth_date || '',
        });
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

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return dateString;
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

    const filteredClients = useMemo(() => {
        const minContractsNumber = minContracts ? parseInt(minContracts, 10) || 0 : 0;
        if (minContractsNumber <= 0) return clients;
        return clients.filter((client) => getContractCount(client) >= minContractsNumber);
    }, [clients, minContracts]);

    const sortedClients = useMemo(
        () =>
            sortRows(
                filteredClients,
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
        [filteredClients, sortKey, sortDir],
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
                <h1 className="dashboard-page-title text-4xl font-bold mb-2">
                    Clientes
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Gestiona tus clientes registrados
                </p>
            </div>
            <div className="flex justify-end mb-8">
                <button
                    onClick={() => {
                        setShowForm(true);
                        resetForm();
                    }}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                    + Nuevo Cliente
                </button>
            </div>

            {/* Filters */}
            <div className="mb-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Buscar
                    </label>
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Nombre del cliente..."
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <div className="flex flex-wrap gap-3 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Registro desde
                        </label>
                        <input
                            type="date"
                            value={registeredFrom}
                            onChange={(e) => setRegisteredFrom(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Registro hasta
                        </label>
                        <input
                            type="date"
                            value={registeredTo}
                            onChange={(e) => setRegisteredTo(e.target.value)}
                            className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Mínimo de pólizas
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={minContracts}
                            onChange={(e) => setMinContracts(e.target.value)}
                            placeholder="0"
                            className="w-24 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
                <div className="flex gap-2 ml-auto">
                <button
                    type="button"
                    onClick={() => {
                        setAppliedSearch(search.trim());
                        setAppliedFrom(registeredFrom);
                        setAppliedTo(registeredTo);
                        setPage(1);
                    }}
                    className="px-3 py-2 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                    Aplicar
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setSearch('');
                        setRegisteredFrom('');
                        setRegisteredTo('');
                        setMinContracts('');
                        setAppliedSearch('');
                        setAppliedFrom('');
                        setAppliedTo('');
                        setPage(1);
                    }}
                    className="px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                    Limpiar filtros
                </button>
                </div>
            </div>

            {/* Form Modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6 my-8">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                                {editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}
                            </h2>
                            <button
                                onClick={() => {
                                    setShowForm(false);
                                    resetForm();
                                }}
                                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Nombre Completo *
                                </label>
                                <input
                                    type="text"
                                    id="name"
                                    name="name"
                                    value={formData.name}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    placeholder="Nombre del cliente"
                                />
                            </div>

                            <div>
                                <label htmlFor="date_of_birth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Fecha de Nacimiento
                                </label>
                                <input
                                    type="date"
                                    id="date_of_birth"
                                    name="date_of_birth"
                                    value={formData.date_of_birth}
                                    onChange={handleInputChange}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>

                            {errorMessage && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                    <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
                                </div>
                            )}

                            <div className="flex justify-end gap-4 pt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowForm(false);
                                        resetForm();
                                    }}
                                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isSubmitting ? 'Guardando...' : editingClient ? 'Actualizar' : 'Crear Cliente'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Clients List */}
            {total === 0 && !loading && !appliedSearch && !appliedFrom && !appliedTo ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                        No tienes clientes registrados aún
                    </p>
                    <button
                        onClick={() => {
                            setShowForm(true);
                            resetForm();
                        }}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                        Agregar Primer Cliente
                    </button>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <SortableTh label="Nombre" active={sortKey === 'name'} dir={sortDir} onSort={() => toggleSort('name')} className={TH} />
                                <SortableTh label="Fecha de Nacimiento" active={sortKey === 'birth_date'} dir={sortDir} onSort={() => toggleSort('birth_date')} className={TH} />
                                <SortableTh label="Edad" active={sortKey === 'age'} dir={sortDir} onSort={() => toggleSort('age')} className={TH} />
                                <SortableTh label="Pólizas" active={sortKey === 'contracts'} dir={sortDir} onSort={() => toggleSort('contracts')} className={TH} />
                                <SortableTh label="Fecha de Registro" active={sortKey === 'created_at'} dir={sortDir} onSort={() => toggleSort('created_at')} className={TH} />
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {sortedClients.length === 0 ? (
                                <tr>
                                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500 dark:text-gray-400">
                                        No hay clientes que coincidan con los filtros.
                                    </td>
                                </tr>
                            ) : sortedClients.map((client) => {
                                const age = calculateAge(client.birth_date);
                                return (
                                    <tr
                                        key={client.id}
                                        onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {client.name}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {formatDate(client.birth_date)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {age !== null ? `${age} años` : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {getContractCount(client)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {client.created_at
                                                    ? new Date(client.created_at).toLocaleDateString('es-MX')
                                                    : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                                            >
                                                Ver Detalles
                                            </button>
                                            <button
                                                onClick={() => handleEdit(client)}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                                            >
                                                Editar
                                            </button>
                                            <button
                                                onClick={() => handleDelete(client.id)}
                                                className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                            >
                                                Eliminar
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
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
            )}
        </div>
    );
}

export default function ClientsPage() {
    return (
        <ProtectedRoute allowedRoles={['consultant', 'promotory']}>
            <ClientsPageContent />
        </ProtectedRoute>
    );
}

