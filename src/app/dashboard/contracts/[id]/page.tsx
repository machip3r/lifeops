'use client';

import { useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractDetail, Client, Consultant } from '@/lib/supabase';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';
import { TablePagination } from '@/components/table-pagination';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import { useAuth } from '@/contexts/auth-context';
import { EditContractDialog } from '@/components/contracts/edit-contract-dialog';
import { ReassignConsultantDialog } from '@/components/contracts/reassign-consultant-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { normalizeCurrency } from '@/lib/contracts/currencies';
import { PageHeader } from '@/components/dashboard/page-header';
import {
    DetailCard,
    DetailField,
    DetailGrid,
} from '@/components/dashboard/detail-card';
import { useQueryEffect, useQueryLoading, useResetPage } from '@/hooks/use-query-effect';

function ContractDetailsPageContent() {
    const router = useRouter();
    const params = useParams();
    const { profile } = useAuth();
    const { toast } = useToast();
    const contractId = params.id as string;
    const [editOpen, setEditOpen] = useState(false);
    const [contract, setContract] = useState<Contract | null>(null);
    const [contractDetails, setContractDetails] = useState<ContractDetail[]>([]);
    const [detailsTotal, setDetailsTotal] = useState(0);
    const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
    const [page, setPage] = useResetPage(String(pageSize));
    const [statsDetails, setStatsDetails] = useState<ContractDetail[]>([]);
    const [client, setClient] = useState<Client | null>(null);
    const [consultant, setConsultant] = useState<Consultant | null>(null);
    const [loading, setLoading] = useQueryLoading(contractId);
    const [detailsLoading, setDetailsLoading] = useQueryLoading(
        `${contractId}\0${page}\0${pageSize}`,
    );

    const loadContractMeta = useCallback(async () => {
        try {
            const [contractWithRelations, allDetails] = await Promise.all([
                db.contract.getContractWithRelations(contractId),
                db.contractDetail.getDetailsByContract(contractId),
            ]);

            if (!contractWithRelations) {
                throw new Error('Contract not found');
            }

            setContract(contractWithRelations.contract);
            setClient(contractWithRelations.client);
            setConsultant(contractWithRelations.consultant);
            setStatsDetails(allDetails);
        } catch (error) {
            console.error('Error loading contract data:', error);
        } finally {
            setLoading(false);
        }
    }, [contractId, setLoading]);

    const loadDetailsPage = useCallback(async () => {
        try {
            const result = await db.contractDetail.getDetailsByContractPage(contractId, {
                page,
                pageSize,
            });
            setContractDetails(result.rows);
            setDetailsTotal(result.total);
        } catch (error) {
            console.error('Error loading contract details page:', error);
        } finally {
            setDetailsLoading(false);
        }
    }, [contractId, page, pageSize, setDetailsLoading]);

    useQueryEffect(Boolean(contractId), loadContractMeta);
    useQueryEffect(Boolean(contractId), loadDetailsPage);

    const formatDate = (dateString: string | null | undefined) => {
        if (!dateString) return 'N/A';
        return formatDateShortEsLocal(dateString);
    };

    // Determine contract type: "inicial" or "renovacion" based on last contract_detail's seniority
    // The last detail is the one with the most recent payment_date
    const getContractType = (): 'inicial' | 'renovacion' | null => {
        if (statsDetails.length === 0) return null;

        // Sort by payment_date descending to get the most recent one
        const sortedDetails = [...statsDetails].sort((a, b) => {
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
            <PageHeader
                title={contract.contract_number || '—'}
                watermark="Póliza"
                eyebrow={
                    <button
                        type="button"
                        onClick={() => router.push('/dashboard/contracts')}
                        className="inline-flex items-center text-[#FBDBAC] hover:underline"
                    >
                        ← Volver a pólizas
                    </button>
                }
                description="Detalles de la póliza"
            />

            <DetailCard
                title="Información"
                actions={
                    <>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setEditOpen(true)}
                        >
                            Editar
                        </Button>
                        {profile?.role === 'promotory' && contract.consultant_id ? (
                            <ReassignConsultantDialog
                                officeId={profile.id}
                                contractId={contract.id}
                                currentConsultantId={contract.consultant_id}
                                onReassigned={() => {
                                    setLoading(true);
                                    void loadContractMeta();
                                }}
                            />
                        ) : null}
                    </>
                }
            >
                <DetailGrid>
                    <DetailField label="Número">
                        <span className="font-mono">{contract.contract_number || '—'}</span>
                    </DetailField>
                    <DetailField label="Cliente">
                        {client?.id ? (
                            <button
                                type="button"
                                onClick={() => router.push(`/dashboard/clients/${client.id}`)}
                                className="text-left text-(--lifeops-accent) hover:underline"
                            >
                                {client.name}
                            </button>
                        ) : (
                            client?.name || '—'
                        )}
                    </DetailField>
                    <DetailField label="Asesor">
                        {consultant?.id && profile?.role === 'promotory' ? (
                            <button
                                type="button"
                                onClick={() => router.push(`/dashboard/consultants/${consultant.id}`)}
                                className="text-left text-(--lifeops-accent) hover:underline"
                            >
                                {consultant.name}
                                {consultant.consultant_code
                                    ? ` · ${consultant.consultant_code}`
                                    : ''}
                            </button>
                        ) : (
                            consultant?.name || '—'
                        )}
                    </DetailField>
                    <DetailField label="Forma de pago">
                        {contract.payment_method || '—'}
                    </DetailField>
                    <DetailField label="Prima anual">
                        {contract.annual_premium || '—'}
                    </DetailField>
                    <DetailField label="Suma asegurada">
                        {contract.insured_amount || '—'}
                    </DetailField>
                    <DetailField label="Moneda">
                        {normalizeCurrency(contract.currency) || contract.currency || '—'}
                    </DetailField>
                    {contractType ? (
                        <DetailField label="Tipo">
                            {contractType === 'inicial' ? 'Inicial' : 'Renovación'}
                        </DetailField>
                    ) : null}
                </DetailGrid>
            </DetailCard>

            <EditContractDialog
                open={editOpen}
                contract={contract}
                onClose={() => setEditOpen(false)}
                onSaved={(next) => {
                    setContract(next);
                    toast.success('Póliza actualizada.');
                }}
            />

            {/* Contract Details Table */}
            {detailsTotal > 0 || contractDetails.length > 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                    <div className="p-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Detalles de la póliza ({detailsTotal} filas)</h2>
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
                    <TablePagination
                        page={page}
                        pageSize={pageSize}
                        total={detailsTotal}
                        disabled={detailsLoading}
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
