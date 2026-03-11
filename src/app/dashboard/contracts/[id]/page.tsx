'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractDetail, Client, Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function ContractDetailsPageContent() {
    const router = useRouter();
    const params = useParams();
    const contractId = params.id as string;
    const { profile } = useAuth();
    const [contract, setContract] = useState<Contract | null>(null);
    const [contractDetails, setContractDetails] = useState<ContractDetail[]>([]);
    const [client, setClient] = useState<Client | null>(null);
    const [consultant, setConsultant] = useState<Consultant | null>(null);
    const [loading, setLoading] = useState(true);

    // UDI actual value - This should ideally be fetched from an API or stored in config
    // For now, using a placeholder. In production, this should be fetched from Banco de México API
    const UDI_ACTUAL_VALUE = 8.5; // Placeholder - should be updated with actual UDI value

    useEffect(() => {
        if (contractId) {
            loadContractData();
        }
    }, [contractId]);

    const loadContractData = async () => {
        try {
            // Load contract with relations and details in parallel (2 queries instead of 4)
            const [contractWithRelations, details] = await Promise.all([
                db.contract.getContractWithRelations(contractId),
                db.contractDetail.getDetailsByContract(contractId),
            ]);

            if (!contractWithRelations) {
                throw new Error('Contract not found');
            }

            setContract(contractWithRelations.contract);
            setClient(contractWithRelations.client);
            setConsultant(contractWithRelations.consultant);
            setContractDetails(details);
        } catch (error) {
            console.error('Error loading contract data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        try {
            // Parse YYYY-MM-DD format and create date in local timezone to avoid day shift
            const parts = dateString.split('-');
            if (parts.length === 3) {
                const year = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Month is 0-indexed
                const day = parseInt(parts[2], 10);
                const date = new Date(year, month, day);
                return date.toLocaleDateString('es-MX', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                });
            }
            // Fallback to original parsing if format is different
            return new Date(dateString).toLocaleDateString('es-MX', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
            });
        } catch {
            return dateString;
        }
    };

    // Calculate contract value: prima cobro * UDI actual value * tipo cambio
    // If exchange_rate is null/undefined, it means MXN (no conversion needed, so use 1)
    const calculateContractValue = (): number => {
        if (!contract || contractDetails.length === 0) return 0;

        const exchangeRate = contract.exchange_rate ?? 1; // If null, it's MXN, so no conversion (1)

        const totalValue = contractDetails.reduce((sum, detail) => {
            const primaCobro = detail.collection_premium || 0;
            // Formula: prima cobro * UDI actual value * tipo cambio
            const detailValue = primaCobro * UDI_ACTUAL_VALUE * exchangeRate;
            return sum + detailValue;
        }, 0);

        return totalValue;
    };

    const contractValue = calculateContractValue();

    // Determine contract type: "inicial" or "renovacion" based on last contract_detail's seniority
    // The last detail is the one with the most recent payment_date
    const getContractType = (): 'inicial' | 'renovacion' | null => {
        if (contractDetails.length === 0) return null;

        // Sort by payment_date descending to get the most recent one
        const sortedDetails = [...contractDetails].sort((a, b) => {
            if (!a.payment_date && !b.payment_date) return 0;
            if (!a.payment_date) return 1;
            if (!b.payment_date) return -1;
            return b.payment_date.localeCompare(a.payment_date);
        });

        const lastDetail = sortedDetails[0];
        if (!lastDetail.seniority) return null;

        // Parse seniority as number (remove commas and spaces)
        const cleaned = lastDetail.seniority.trim().replace(/,/g, '').replace(/\s/g, '');
        const seniorityNum = parseFloat(cleaned);
        if (isNaN(seniorityNum)) return null;

        // If seniority is 1, it's "inicial", if more than 1 it's "renovacion"
        return seniorityNum === 1 ? 'inicial' : 'renovacion';
    };

    const contractType = getContractType();

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
            </div>
        );
    }

    if (!contract) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">Contrato no encontrado</p>
                    <button
                        onClick={() => router.push('/dashboard/contracts')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Volver a Contratos
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-8">
                <div>
                    <button
                        onClick={() => router.push('/dashboard/contracts')}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mb-2 inline-flex items-center"
                    >
                        ← Volver a Contratos
                    </button>
                    <h1 className="dashboard-page-title text-4xl font-bold mb-1">
                        Detalles del Contrato
                    </h1>
                    {contract.contract_number && (
                        <p className="text-gray-700 dark:text-gray-300 text-lg font-medium mb-1">
                            {contract.contract_number.startsWith('GM')
                                ? 'Seguro de gastos mayores'
                                : contract.contract_number.startsWith('VI')
                                    ? 'Seguro de vida'
                                    : ''}
                        </p>
                    )}
                    {contractType && (
                        <p className="text-gray-700 dark:text-gray-300 text-lg font-medium mb-1">
                            {contractType === 'inicial' ? 'Contrato Inicial' : 'Contrato Renovación'}
                        </p>
                    )}
                    <p className="text-gray-600 dark:text-gray-400">
                        Número de Contrato: {contract.contract_number || 'N/A'}
                    </p>
                </div>
            </div>

            {/* Contract Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Información del Contrato</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Cliente</span>
                        <p className="text-sm text-gray-900 dark:text-white">{client?.name || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Asesor</span>
                        <p className="text-sm text-gray-900 dark:text-white">{consultant?.name || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Número de Contrato</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.contract_number || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo de Contrato</span>
                        <p className="text-sm text-gray-900 dark:text-white">
                            {contractType
                                ? (contractType === 'inicial' ? 'Inicial' : 'Renovación')
                                : 'N/A'}
                        </p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre del Proyecto</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.project_name || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Suma Asegurada</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.insured_amount || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Prima Anual</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.annual_premium || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Método de Pago</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.payment_method || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Moneda</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.currency || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Tipo de Cambio</span>
                        <p className="text-sm text-gray-900 dark:text-white">
                            {contract.exchange_rate != null
                                ? contract.exchange_rate.toLocaleString('es-MX', { minimumFractionDigits: 4, maximumFractionDigits: 4 })
                                : 'MXN (Sin conversión)'}
                        </p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Valor del Contrato</span>
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                            ${contractValue.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            (Prima Cobro × UDI {UDI_ACTUAL_VALUE} × Tipo Cambio {contract.exchange_rate ?? 1})
                        </p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Canal de Pago</span>
                        <p className="text-sm text-gray-900 dark:text-white">{contract.payment_channel || 'N/A'}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de Captura</span>
                        <p className="text-sm text-gray-900 dark:text-white">{formatDate(contract.capture_date)}</p>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</span>
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${contract.status === 'ACTIVE'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                            }`}>
                            {contract.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                        </span>
                    </div>
                    <div>
                        <span className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de Creación</span>
                        <p className="text-sm text-gray-900 dark:text-white">{formatDate(contract.created_at)}</p>
                    </div>
                </div>
            </div>

            {/* Contract Details Table */}
            {contractDetails.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-x-auto">
                    <div className="p-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Detalles del Contrato ({contractDetails.length} filas)</h2>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">FECHA EMISION</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">FECHA PAGO</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">PRIMA PAGO</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">FORMA DE PAGO</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">COMISION/HONORARIOS</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">% COMISION</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">PRIMA COBRO</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">ANTIGÜEDAD</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">PRIMA META</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">MOVIMIENTO</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">PRIMA COMISION</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {contractDetails.map((detail) => (
                                    <tr key={detail.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {formatDate(detail.issue_date)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {formatDate(detail.payment_date)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.premium_payment != null
                                                ? `$${detail.premium_payment.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.payment_method || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.commission_honoraries != null
                                                ? `$${detail.commission_honoraries.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.commission_percentage != null
                                                ? `${detail.commission_percentage.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.collection_premium != null
                                                ? `$${detail.collection_premium.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.seniority || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.target_premium != null
                                                ? `$${detail.target_premium.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.movement || 'N/A'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                                            {detail.commission_premium != null
                                                ? `$${detail.commission_premium.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                                : 'N/A'}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-12 text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg">
                        No se encontraron detalles de la póliza para esta póliza
                    </p>
                </div>
            )}
        </div>
    );
}

export default function ContractDetailsPage() {
    return (
        <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
            <ContractDetailsPageContent />
        </ProtectedRoute>
    );
}
