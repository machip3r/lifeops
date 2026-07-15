'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Contract, Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ContractsFilters, ContractsFilterState, filterContracts } from '@/components/contracts-filters';
import { useToast } from '@/components/toast';

function ContractsPageContent() {
    const router = useRouter();
    const { profile } = useAuth();
    const { toast } = useToast();
    const [contracts, setContracts] = useState<Array<Contract & { client_name?: string }>>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [loading, setLoading] = useState(true);
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

            // Use optimized function that includes client names in the query
            const dataWithClients = await db.contract.getContractsWithClients(
                profile.role === 'consultant' ? profile.id : undefined,
                profile.role === 'promotory' ? profile.id : undefined
            );

            setContracts(dataWithClients);

            // Extract unique clients for the client list (if needed elsewhere)
            const uniqueClients = new Map<string, Client>();
            dataWithClients.forEach((contract: any) => {
                if (contract.client_id && contract.client_name) {
                    if (!uniqueClients.has(contract.client_id)) {
                        uniqueClients.set(contract.client_id, {
                            id: contract.client_id,
                            name: contract.client_name,
                        } as Client);
                    }
                }
            });
            setClients(Array.from(uniqueClients.values()));
        } catch (error) {
            console.error('Error loading contracts:', error);
        } finally {
            setLoading(false);
        }
    }, [profile]);

    useEffect(() => {
        if (profile) {
            loadContracts();
        }
    }, [profile, loadContracts]);

    const getClientName = (clientId: string | null | undefined) => {
        if (!clientId) return 'N/A';
        const contract = contracts.find(c => c.client_id === clientId);
        return (contract as any)?.client_name || 'N/A';
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

    const availableCurrencies = useMemo(
        () => Array.from(new Set(contracts.map(c => c.currency).filter((c): c is string => !!c))),
        [contracts]
    );

    const availablePaymentMethods = useMemo(
        () => Array.from(new Set(contracts.map(c => c.payment_method).filter((m): m is string => !!m))),
        [contracts]
    );

    const filteredContracts = useMemo(
        () => filterContracts(contracts, filters),
        [contracts, filters]
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

            {/* Contracts List */}
            {contracts.length === 0 ? (
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
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <ContractsFilters
                            filters={filters}
                            onChange={setFilters}
                            availableCurrencies={availableCurrencies}
                            availablePaymentMethods={availablePaymentMethods}
                        />
                    </div>
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Cliente
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Número de Póliza
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Nombre del Proyecto
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Suma Asegurada
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Prima Anual
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Método de Pago
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Moneda
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Canal de Pago
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Fecha de Captura
                                </th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Estado
                                </th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                    Acciones
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                            {filteredContracts.map((contract) => (
                                <tr
                                    key={contract.id}
                                    onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                                    className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {(contract as any).client_name || getClientName(contract.client_id) || 'N/A'}
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
                            ))}
                        </tbody>
                    </table>
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

