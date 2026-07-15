'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Client, Contract, Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ContractsFilters, ContractsFilterState, filterContracts } from '@/components/contracts-filters';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { nextSortState, sortRows, type SortDir } from '@/lib/table-sort';

type SortKey =
  | 'contract_number'
  | 'consultant'
  | 'project_name'
  | 'insured_amount'
  | 'annual_premium'
  | 'savings'
  | 'status'
  | 'created_at';
const TH = 'px-6 py-3 text-gray-500 dark:text-gray-300';

function ClientDetailsPageContent() {
    const router = useRouter();
    const params = useParams();
    const clientId = params.id as string;
    const { profile } = useAuth();
    const [client, setClient] = useState<Client | null>(null);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [contractsTotal, setContractsTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [contractsLoading, setContractsLoading] = useState(false);
    const [consultantsMap, setConsultantsMap] = useState<Map<string, Consultant>>(new Map());
    const [contractSavingsMap, setContractSavingsMap] = useState<Map<string, number>>(new Map());
    const [loading, setLoading] = useState(true);
    const [sortKey, setSortKey] = useState<SortKey | null>(null);
    const [sortDir, setSortDir] = useState<SortDir>('asc');
    const [filters, setFilters] = useState<ContractsFilterState>({
        search: '',
        currency: '',
        paymentMethod: '',
        captureDateFrom: '',
        captureDateTo: '',
    });

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

    const sortedContracts = useMemo(
        () =>
            sortRows(filteredContracts, sortKey, sortDir, {
                contract_number: (c) => c.contract_number,
                consultant: (c) => consultantsMap.get(c.consultant_id)?.name,
                project_name: (c) => c.project_name,
                insured_amount: (c) => c.insured_amount,
                annual_premium: (c) => c.annual_premium,
                savings: (c) => contractSavingsMap.get(c.id) ?? 0,
                status: (c) => c.status,
                created_at: (c) => c.created_at,
            }, {
                insured_amount: 'number',
                annual_premium: 'number',
                savings: 'number',
                created_at: 'date',
            }),
        [filteredContracts, sortKey, sortDir, consultantsMap, contractSavingsMap],
    );

    const toggleSort = (key: SortKey) => {
        const next = nextSortState(sortKey, sortDir, key);
        setSortKey(next.key);
        setSortDir(next.dir);
    };

    const loadClientData = useCallback(async () => {
        try {
            setContractsLoading(true);
            const [clientData, contractsPage] = await Promise.all([
                db.client.getClientById(clientId),
                db.contract.getContractsWithClientsPage({
                    clientId,
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

            // Load consultant names for contracts on this page
            const consultantIds = [...new Set(contractsData.map(c => c.consultant_id).filter((id): id is string => !!id))];
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

            // Savings (ahorro cliente) for contracts on this page only
            const savingsMap = new Map<string, number>();

            for (const contract of contractsData) {
                try {
                    const details = await db.contractDetail.getDetailsByContract(contract.id);
                    const totalSavings = details.reduce((sum, detail) => {
                        const collectionPremium = detail.collection_premium || 0;
                        return sum + collectionPremium;
                    }, 0);
                    savingsMap.set(contract.id, totalSavings);
                } catch (error) {
                    console.error(`Error loading details for contract ${contract.id}:`, error);
                    savingsMap.set(contract.id, 0);
                }
            }

            setContractSavingsMap(savingsMap);
        } catch (error: any) {
            console.error('Error loading client data:', error);
        } finally {
            setLoading(false);
            setContractsLoading(false);
        }
    }, [clientId, page, pageSize]);


    useEffect(() => {
        if (clientId) {
            loadClientData();
        }
    }, [clientId, loadClientData]);

    useEffect(() => {
        setPage(1);
    }, [pageSize]);

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
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">Cliente no encontrado</p>
                    <button
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
            <div className="flex justify-between items-center mb-8">
                <div>
                    <button
                        onClick={() => router.push('/dashboard/clients')}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mb-2 inline-flex items-center"
                    >
                        ← Volver a Clientes
                    </button>
                    <h1 className="dashboard-page-title text-4xl font-bold mb-1">
                        {client.name}
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Detalles del cliente
                    </p>
                </div>
            </div>

            {/* Client Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Información del Cliente</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre Completo</span>
                        <p id="client-name" className="text-sm text-gray-900 dark:text-white">{client.name}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de Nacimiento</span>
                        <p id="client-birth-date" className="text-sm text-gray-900 dark:text-white">{formatDate(client.birth_date)}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Edad</span>
                        <p id="client-age" className="text-sm text-gray-900 dark:text-white">{age !== null ? `${age} años` : 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Total de Pólizas</span>
                        <p id="client-total-policies" className="text-sm text-gray-900 dark:text-white">{contractsTotal}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de Registro</span>
                        <p id="client-registration-date" className="text-sm text-gray-900 dark:text-white">
                            {client.created_at ? new Date(client.created_at).toLocaleDateString('es-MX') : 'N/A'}
                        </p>
                    </div>
                </div>
            </div>

            {/* Contracts List */}
            {contractsTotal > 0 || contracts.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                            Pólizas ({filteredContracts.length} de {contractsTotal})
                        </h2>
                        <ContractsFilters
                            filters={filters}
                            onChange={setFilters}
                            availableCurrencies={availableCurrencies}
                            availablePaymentMethods={availablePaymentMethods}
                        />
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <SortableTh label="Número de Póliza" active={sortKey === 'contract_number'} dir={sortDir} onSort={() => toggleSort('contract_number')} className={TH} />
                                    <SortableTh label="Asesor" active={sortKey === 'consultant'} dir={sortDir} onSort={() => toggleSort('consultant')} className={TH} />
                                    <SortableTh label="Nombre del Proyecto" active={sortKey === 'project_name'} dir={sortDir} onSort={() => toggleSort('project_name')} className={TH} />
                                    <SortableTh label="Suma Asegurada" active={sortKey === 'insured_amount'} dir={sortDir} onSort={() => toggleSort('insured_amount')} className={TH} />
                                    <SortableTh label="Prima Anual" active={sortKey === 'annual_premium'} dir={sortDir} onSort={() => toggleSort('annual_premium')} className={TH} />
                                    <SortableTh label="Ahorro Cliente" active={sortKey === 'savings'} dir={sortDir} onSort={() => toggleSort('savings')} className={TH} />
                                    <SortableTh label="Estado" active={sortKey === 'status'} dir={sortDir} onSort={() => toggleSort('status')} className={TH} />
                                    <SortableTh label="Fecha de Creación" active={sortKey === 'created_at'} dir={sortDir} onSort={() => toggleSort('created_at')} className={TH} />
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {sortedContracts.map((contract) => (
                                    <tr
                                        key={contract.id}
                                        onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                {contract.contract_number || 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {contract.consultant_id && consultantsMap.has(contract.consultant_id)
                                                    ? consultantsMap.get(contract.consultant_id)?.name || 'N/A'
                                                    : contract.consultant_id
                                                        ? 'Cargando...'
                                                        : 'N/A'}
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
                                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                ${(contractSavingsMap.get(contract.id) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${contract.status === 'PENDING'
                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                : contract.status === 'APPROVED'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                                                }`}>
                                                {contract.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                {contract.created_at
                                                    ? new Date(contract.created_at).toLocaleDateString('es-MX')
                                                    : 'N/A'}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
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
                        total={contractsTotal}
                        disabled={contractsLoading}
                        onPageChange={setPage}
                        onPageSizeChange={(size) => {
                            setPageSize(size);
                            setPage(1);
                        }}
                    />
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                        Este cliente no tiene pólizas registradas
                    </p>
                </div>
            )}
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
