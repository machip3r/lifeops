'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ContractsFilters, ContractsFilterState } from '@/components/contracts-filters';
import { useToast } from '@/components/toast';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type ContractRow = Contract & { client_name?: string };
type SortKey =
  | 'client_name'
  | 'contract_number'
  | 'project_name'
  | 'insured_amount'
  | 'annual_premium'
  | 'payment_method'
  | 'currency'
  | 'payment_channel'
  | 'capture_date'
  | 'status';

const SORT_GETTERS: Record<SortKey, (row: ContractRow) => string | number | Date | null | undefined> = {
  client_name: (r) => r.client_name,
  contract_number: (r) => r.contract_number,
  project_name: (r) => r.project_name,
  insured_amount: (r) => r.insured_amount,
  annual_premium: (r) => r.annual_premium,
  payment_method: (r) => r.payment_method,
  currency: (r) => r.currency,
  payment_channel: (r) => r.payment_channel,
  capture_date: (r) => r.capture_date || r.created_at,
  status: (r) => r.status,
};

const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

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
    const [filters, setFilters] = useState<ContractsFilterState>({
        search: '',
        currency: '',
        paymentMethod: '',
        captureDateFrom: '',
        captureDateTo: '',
    });

    const loadContracts = useCallback(async () => {
        try {
            if (!profile?.id) return;

            const dbSort =
                sortKey && sortKey !== 'client_name'
                    ? { column: sortKey, ascending: sortDir === 'asc' }
                    : undefined;

            const result = await db.contract.getContractsWithClientsPage({
                consultantId: profile.role === 'consultant' ? profile.id : undefined,
                officeId: profile.role === 'promotory' ? profile.id : undefined,
                search: filters.search || undefined,
                currency: filters.currency || undefined,
                paymentMethod: filters.paymentMethod || undefined,
                captureDateFrom: filters.captureDateFrom || undefined,
                captureDateTo: filters.captureDateTo || undefined,
                sort: dbSort,
                page,
                pageSize,
            });

            setContracts(result.rows);
            setTotal(result.total);
        } catch (error) {
            console.error('Error loading contracts:', error);
        } finally {
            setLoading(false);
        }
    }, [profile, page, pageSize, filters, sortKey, sortDir]);

    useEffect(() => {
        if (profile) {
            loadContracts();
        }
    }, [profile, loadContracts]);

    useEffect(() => {
        setPage(1);
    }, [filters, pageSize, sortKey, sortDir]);

    const handleFiltersChange = (next: ContractsFilterState) => {
        setFilters(next);
        setPage(1);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('¿Estás seguro de que quieres eliminar esta póliza?')) return;

        try {
            await db.contract.deleteContract(id);
            loadContracts();
        } catch (error) {
            console.error('Error deleting contract:', error);
            toast.error('Error al eliminar la póliza');
        }
    };

    const availableCurrencies = useMemo(() => {
        const fromRows = contracts.map((c) => c.currency).filter((c): c is string => !!c);
        if (filters.currency && !fromRows.includes(filters.currency)) {
            fromRows.push(filters.currency);
        }
        return Array.from(new Set(fromRows));
    }, [contracts, filters.currency]);

    const availablePaymentMethods = useMemo(() => {
        const fromRows = contracts.map((c) => c.payment_method).filter((m): m is string => !!m);
        if (filters.paymentMethod && !fromRows.includes(filters.paymentMethod)) {
            fromRows.push(filters.paymentMethod);
        }
        return Array.from(new Set(fromRows));
    }, [contracts, filters.paymentMethod]);

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

    const hasActiveFilters = !!(
        filters.search.trim() ||
        filters.currency ||
        filters.paymentMethod ||
        filters.captureDateFrom ||
        filters.captureDateTo
    );

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
                    Pólizas
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    {profile?.role === 'promotory'
                        ? 'Gestiona las pólizas de tus asesores'
                        : 'Gestiona tus pólizas'}
                </p>
            </div>
            <div className="flex justify-end mb-8">
                <button
                    onClick={() => router.push('/dashboard/contracts/new')}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                >
                    + {profile?.role === 'promotory' ? 'Registrar Emisión' : 'Emitir Póliza'}
                </button>
            </div>

            {total === 0 && !hasActiveFilters ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
                        Aún no hay pólizas registradas
                    </p>
                    <button
                        onClick={() => router.push('/dashboard/contracts/new')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                        Crear Primera Póliza
                    </button>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <ContractsFilters
                            filters={filters}
                            onChange={handleFiltersChange}
                            availableCurrencies={availableCurrencies}
                            availablePaymentMethods={availablePaymentMethods}
                        />
                    </div>
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <SortableTh label="Cliente" active={sortKey === 'client_name'} dir={sortDir} onSort={() => toggleSort('client_name')} className={TH} />
                                <SortableTh label="Número de Póliza" active={sortKey === 'contract_number'} dir={sortDir} onSort={() => toggleSort('contract_number')} className={TH} />
                                <SortableTh label="Nombre del Proyecto" active={sortKey === 'project_name'} dir={sortDir} onSort={() => toggleSort('project_name')} className={TH} />
                                <SortableTh label="Suma Asegurada" active={sortKey === 'insured_amount'} dir={sortDir} onSort={() => toggleSort('insured_amount')} className={TH} />
                                <SortableTh label="Prima Anual" active={sortKey === 'annual_premium'} dir={sortDir} onSort={() => toggleSort('annual_premium')} className={TH} />
                                <SortableTh label="Método de Pago" active={sortKey === 'payment_method'} dir={sortDir} onSort={() => toggleSort('payment_method')} className={TH} />
                                <SortableTh label="Moneda" active={sortKey === 'currency'} dir={sortDir} onSort={() => toggleSort('currency')} className={TH} />
                                <SortableTh label="Canal de Pago" active={sortKey === 'payment_channel'} dir={sortDir} onSort={() => toggleSort('payment_channel')} className={TH} />
                                <SortableTh label="Fecha de Captura" active={sortKey === 'capture_date'} dir={sortDir} onSort={() => toggleSort('capture_date')} className={TH} />
                                <SortableTh label="Estado" active={sortKey === 'status'} dir={sortDir} onSort={() => toggleSort('status')} className={TH} />
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {displayedContracts.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                        No hay pólizas que coincidan con los filtros.
                                    </td>
                                </tr>
                            ) : (
                                displayedContracts.map((contract) => (
                                <tr
                                    key={contract.id}
                                    onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {contract.client_name || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.contract_number || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.project_name || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.insured_amount || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.annual_premium || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.payment_method || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.currency || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.payment_channel || 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-600 dark:text-gray-400">
                                            {contract.capture_date
                                                ? new Date(contract.capture_date).toLocaleDateString('es-MX')
                                                : contract.created_at
                                                    ? new Date(contract.created_at).toLocaleDateString('es-MX')
                                                    : 'N/A'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${contract.status === 'PENDING'
                                            ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                            : contract.status === 'ACTIVE'
                                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                            }`}>
                                            {contract.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                        <button
                                            onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                                            className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mr-4"
                                        >
                                            Ver Detalles
                                        </button>
                                        {profile?.role === 'consultant' && (
                                            <>
                                                <button
                                                    onClick={() => router.push(`/dashboard/contracts/${contract.id}/change`)}
                                                    className="text-orange-600 dark:text-orange-400 hover:text-orange-900 dark:hover:text-orange-300 mr-4"
                                                >
                                                    Solicitar Cambio
                                                </button>
                                                <button
                                                    onClick={() => router.push(`/dashboard/contracts/${contract.id}/correct-folio`)}
                                                    className="text-green-600 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 mr-4"
                                                >
                                                    Corregir Folio
                                                </button>
                                            </>
                                        )}
                                        <button
                                            onClick={() => router.push(`/dashboard/contracts/${contract.id}/files`)}
                                            className="text-purple-600 dark:text-purple-400 hover:text-purple-900 dark:hover:text-purple-300 mr-4"
                                        >
                                            Archivos
                                        </button>
                                        <button
                                            onClick={() => handleDelete(contract.id)}
                                            className="text-red-600 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300"
                                        >
                                            Eliminar
                                        </button>
                                    </td>
                                </tr>
                                ))
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
            )}
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
