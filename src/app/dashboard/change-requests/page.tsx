'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ContractChangeRequest } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type ChangeRequestRow = ContractChangeRequest & {
    contract_number?: string | null;
};

type SortKey = 'request_type' | 'folio_number' | 'contract_number' | 'details' | 'status' | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

function ChangeRequestsPageContent() {
    const router = useRouter();
    const { profile } = useAuth();
    const [changeRequests, setChangeRequests] = useState<ChangeRequestRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [total, setTotal] = useState(0);

    const loadChangeRequests = useCallback(async () => {
        try {
            if (!profile?.id) return;

            const dbSort =
                sortKey && sortKey !== 'contract_number'
                    ? { column: sortKey, ascending: sortDir === 'asc' }
                    : undefined;

            const result = await db.contractChangeRequest.getChangeRequestsPage({
                officeId: profile.role === 'promotory' ? profile.id : undefined,
                consultantId: profile.role === 'consultant' ? profile.id : undefined,
                sort: dbSort,
                page,
                pageSize,
            });

            setChangeRequests(result.rows);
            setTotal(result.total);
        } catch (error) {
            console.error('Error loading change requests:', error);
        } finally {
            setLoading(false);
        }
    }, [profile, page, pageSize, sortKey, sortDir]);

    useEffect(() => {
        if (profile) {
            loadChangeRequests();
        }
    }, [profile, loadChangeRequests]);

    useEffect(() => {
        setPage(1);
    }, [pageSize, sortKey, sortDir]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'APPROVED':
                return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
            case 'REJECTED':
                return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
            case 'PENDING':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
        }
    };

    const displayedRequests = useMemo(() => {
        if (sortKey === 'contract_number') {
            return sortRows(changeRequests, sortKey, sortDir, {
                contract_number: (r) => r.contract_number,
            });
        }
        return changeRequests;
    }, [changeRequests, sortKey, sortDir]);

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
                    Solicitudes de Cambio
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    {profile?.role === 'promotory'
                        ? 'Gestiona las solicitudes de cambio de tus asesores'
                        : 'Gestiona tus solicitudes de cambio'}
                </p>
            </div>
            {profile?.role === 'consultant' && (
                <div className="flex justify-end mb-8">
                    <button
                        onClick={() => router.push('/dashboard/contracts/new')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
                    >
                        + Nueva Solicitud
                    </button>
                </div>
            )}

            {total === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                        No hay solicitudes de cambio registradas
                    </p>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <SortableTh label="Tipo" active={sortKey === 'request_type'} dir={sortDir} onSort={() => toggleSort('request_type')} className={TH} />
                                <SortableTh label="Folio" active={sortKey === 'folio_number'} dir={sortDir} onSort={() => toggleSort('folio_number')} className={TH} />
                                <SortableTh label="Póliza" active={sortKey === 'contract_number'} dir={sortDir} onSort={() => toggleSort('contract_number')} className={TH} />
                                <SortableTh label="Descripción" active={sortKey === 'details'} dir={sortDir} onSort={() => toggleSort('details')} className={TH} />
                                <SortableTh label="Estado" active={sortKey === 'status'} dir={sortDir} onSort={() => toggleSort('status')} className={TH} />
                                <SortableTh label="Fecha" active={sortKey === 'created_at'} dir={sortDir} onSort={() => toggleSort('created_at')} className={TH} />
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {displayedRequests.map((request) => (
                                    <tr
                                        key={request.id}
                                        onClick={() => router.push(`/dashboard/change-requests/${request.id}`)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {request.request_type === 'CHANGE' ? 'Cambio' : 'Corrección'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {request.folio_number || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {request.contract_number || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                                                {request.details || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(request.status)}`}>
                                                {request.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {request.created_at
                                                    ? new Date(request.created_at).toLocaleDateString('es-MX')
                                                    : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => router.push(`/dashboard/change-requests/${request.id}`)}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300"
                                            >
                                                Ver Detalles
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

export default function ChangeRequestsPage() {
    return (
        <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
            <ChangeRequestsPageContent />
        </ProtectedRoute>
    );
}
