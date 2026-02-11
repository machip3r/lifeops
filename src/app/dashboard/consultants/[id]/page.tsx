'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Consultant, Contract, ContractDetail } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function getCurrentMonthStartEnd(): { start: string; end: string } {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
    return { start: `${y}-${m}-01`, end: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

function ConsultantDetailsPageContent() {
    const router = useRouter();
    const params = useParams();
    const consultantId = params.id as string;
    const { profile } = useAuth();
    const { start: defaultStart, end: defaultEnd } = getCurrentMonthStartEnd();
    const [dateStart, setDateStart] = useState(defaultStart);
    const [dateEnd, setDateEnd] = useState(defaultEnd);
    const [pendingDateStart, setPendingDateStart] = useState(defaultStart);
    const [pendingDateEnd, setPendingDateEnd] = useState(defaultEnd);
    const [consultant, setConsultant] = useState<Consultant | null>(null);
    const [contracts, setContracts] = useState<Contract[]>([]);
    const [contractDetails, setContractDetails] = useState<ContractDetail[]>([]);
    const [totalPrimaPago, setTotalPrimaPago] = useState(0);
    const [totalPrimaMeta, setTotalPrimaMeta] = useState(0);
    const [primaPagoVI, setPrimaPagoVI] = useState(0);
    const [primaPagoGM, setPrimaPagoGM] = useState(0);
    const [primaMetaVI, setPrimaMetaVI] = useState(0);
    const [primaMetaGM, setPrimaMetaGM] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState('');
    const [editEmail, setEditEmail] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isSendingInvite, setIsSendingInvite] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const loadConsultantData = useCallback(async () => {
        try {
            setLoading(true);
            const [consultantData, contractsData, totals, totalsByType] = await Promise.all([
                db.consultant.getConsultantById(consultantId),
                db.contract.getContractsByConsultant(consultantId),
                db.dashboard.getConsultantTotals(consultantId, dateStart, dateEnd),
                db.dashboard.getConsultantTotalsByType(consultantId, dateStart, dateEnd),
            ]);

            if (!consultantData) {
                throw new Error('Consultor no encontrado');
            }

            setConsultant(consultantData);
            setEditName(consultantData.name);
            setEditEmail(consultantData.email || '');
            setContracts(contractsData);
            setTotalPrimaPago(totals.totalPrimaPago);
            setTotalPrimaMeta(totals.totalPrimaMeta);
            setPrimaPagoVI(totalsByType.primaPagoVI);
            setPrimaPagoGM(totalsByType.primaPagoGM);
            setPrimaMetaVI(totalsByType.primaMetaVI);
            setPrimaMetaGM(totalsByType.primaMetaGM);

            const allDetails: ContractDetail[] = [];
            for (const contract of contractsData) {
                const details = await db.contractDetail.getDetailsByContract(contract.id);
                allDetails.push(...details);
            }
            setContractDetails(allDetails);
        } catch (error: any) {
            console.error('Error loading consultant data:', error);
            setError(error.message || 'Error al cargar los datos del consultor');
        } finally {
            setLoading(false);
        }
    }, [consultantId, dateStart, dateEnd]);

    useEffect(() => {
        if (consultantId) {
            loadConsultantData();
        }
    }, [consultantId, loadConsultantData]);

    const handleSave = async () => {
        if (!consultant) return;

        setIsSaving(true);
        setError('');
        setSuccess('');

        try {
            await db.consultant.updateConsultant(consultant.id, {
                name: editName,
                email: editEmail || null,
            });

            setConsultant({ ...consultant, name: editName, email: editEmail || null });
            setSuccess('Información actualizada exitosamente');
            setIsEditing(false);

            setTimeout(() => setSuccess(''), 3000);
        } catch (error: any) {
            console.error('Error updating consultant:', error);
            setError(error.message || 'Error al actualizar la información');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSendInvitation = async () => {
        if (!consultant || !profile?.id) return;

        if (!editEmail) {
            setError('El correo electrónico es requerido para enviar la invitación');
            return;
        }

        setIsSendingInvite(true);
        setError('');
        setSuccess('');

        try {
            const response = await fetch('/api/invite-consultant', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    officeId: profile.id,
                    consultantEmail: editEmail,
                    consultantName: editName,
                    consultantCode: consultant.consultant_code || '',
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Error al enviar la invitación');
            }

            setSuccess(`Invitación enviada exitosamente a ${editEmail}`);
            setTimeout(() => setSuccess(''), 3000);
        } catch (error: any) {
            console.error('Error sending invitation:', error);
            setError(error.message || 'Error al enviar la invitación');
        } finally {
            setIsSendingInvite(false);
        }
    };

    // Calculate total sales (sum of premium_payment)
    const totalSales = contractDetails.reduce((sum, detail) => {
        const premium = detail.premium_payment || 0;
        return sum + premium;
    }, 0);

    // Group sales by month for chart
    // Parse date string (YYYY-MM-DD) manually to avoid timezone issues
    const salesByMonth = contractDetails.reduce((acc, detail) => {
        if (!detail.payment_date) return acc;

        // Parse YYYY-MM-DD format manually to avoid timezone conversion
        const parts = detail.payment_date.split('-');
        if (parts.length === 3) {
            const year = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10); // Month is 1-12 in the string
            const monthKey = `${year}-${String(month).padStart(2, '0')}`;
            const premium = detail.premium_payment || 0;
            acc[monthKey] = (acc[monthKey] || 0) + premium;
        }
        return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(salesByMonth)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-12) // Last 12 months
        .map(([month, sales]) => {
            // Parse YYYY-MM format manually to avoid timezone issues
            const parts = month.split('-');
            const year = parseInt(parts[0], 10);
            const monthNum = parseInt(parts[1], 10);
            // Create date in local timezone
            const date = new Date(year, monthNum - 1, 1);
            return {
                month: date.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' }),
                sales,
            };
        });

    const maxSales = Math.max(...chartData.map(d => d.sales), 1);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
            </div>
        );
    }

    if (!consultant) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">Consultor no encontrado</p>
                    <button
                        onClick={() => router.push('/dashboard/consultants')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Volver a Asesores
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
                        onClick={() => router.push('/dashboard/consultants')}
                        className="text-blue-600 dark:text-blue-400 hover:text-blue-900 dark:hover:text-blue-300 mb-4"
                    >
                        ← Volver a Asesores
                    </button>
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
                        Detalles del Asesor
                    </h1>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            {success && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
                    <p className="text-sm text-green-800 dark:text-green-200">{success}</p>
                </div>
            )}

            {/* Date range filter — apply with button to avoid query on every change */}
            <div className="flex flex-wrap items-center gap-4 mb-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Rango de fechas (totales por fecha de pago):</span>
                <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Desde</span>
                        <input
                            type="date"
                            value={pendingDateStart}
                            onChange={(e) => setPendingDateStart(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </label>
                    <label className="flex items-center gap-2">
                        <span className="text-sm text-gray-500 dark:text-gray-400">Hasta</span>
                        <input
                            type="date"
                            value={pendingDateEnd}
                            onChange={(e) => setPendingDateEnd(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </label>
                    <button
                        type="button"
                        onClick={() => {
                            const { start, end } = getCurrentMonthStartEnd();
                            setPendingDateStart(start);
                            setPendingDateEnd(end);
                        }}
                        className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Mes actual
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setDateStart(pendingDateStart);
                            setDateEnd(pendingDateEnd);
                        }}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
                    >
                        Aplicar
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Total Prima Pago
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${totalPrimaPago.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Total Prima Meta
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${totalPrimaMeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Prima Pago by Contract Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Prima Pago - Seguro de Vida (VI)
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${primaPagoVI.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Prima Pago - Seguro de Gastos Mayores (GM)
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${primaPagoGM.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Prima Meta by Contract Type */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Prima Meta - Seguro de Vida (VI)
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${primaMetaVI.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                        Prima Meta - Seguro de Gastos Mayores (GM)
                    </h3>
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${primaMetaGM.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                </div>
            </div>

            {/* Consultant Information */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Información del Asesor</h2>
                    {!isEditing && (
                        <button
                            onClick={() => setIsEditing(true)}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                        >
                            Editar
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre
                            </label>
                            <input
                                type="text"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Correo Electrónico
                            </label>
                            <input
                                type="email"
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex space-x-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isSaving ? 'Guardando...' : 'Guardar'}
                            </button>
                            <button
                                onClick={() => {
                                    setIsEditing(false);
                                    setEditName(consultant.name);
                                    setEditEmail(consultant.email || '');
                                    setError('');
                                }}
                                className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Nombre</label>
                            <p className="text-sm text-gray-900 dark:text-white">{consultant.name}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Correo Electrónico</label>
                            <p className="text-sm text-gray-900 dark:text-white">{consultant.email || 'No establecido'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Código</label>
                            <p className="text-sm text-gray-900 dark:text-white">{consultant.consultant_code || 'No establecido'}</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Estado</label>
                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${consultant.status === 'ACTIVE'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : consultant.status === 'PENDING'
                                    ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                }`}>
                                {consultant.status === 'ACTIVE' ? 'Activo' : consultant.status === 'PENDING' ? 'Pendiente' : 'Inactivo'}
                            </span>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">Fecha de Registro</label>
                            <p className="text-sm text-gray-900 dark:text-white">
                                {consultant.created_at
                                    ? new Date(consultant.created_at).toLocaleDateString('es-MX')
                                    : 'N/A'}
                            </p>
                        </div>
                        <div>
                            <button
                                onClick={handleSendInvitation}
                                disabled={isSendingInvite || !editEmail}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
                            >
                                {isSendingInvite ? 'Enviando...' : 'Enviar Invitación por Email'}
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Sales Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">Ventas del Asesor</h2>
                <div className="mb-4">
                    <p className="text-3xl font-bold text-gray-900 dark:text-white">
                        ${totalSales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total en primas pagadas</p>
                </div>
                {chartData.length > 0 ? (
                    <div className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Ventas por Mes</h3>
                        <div className="space-y-3">
                            {chartData.map((item, index) => (
                                <div key={index} className="flex items-center">
                                    <div className="w-24 text-sm text-gray-600 dark:text-gray-400">
                                        {item.month}
                                    </div>
                                    <div className="flex-1 mx-4">
                                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-6">
                                            <div
                                                className="bg-blue-600 h-6 rounded-full flex items-center justify-end pr-2"
                                                style={{ width: `${(item.sales / maxSales) * 100}%` }}
                                            >
                                                <span className="text-xs text-white font-semibold">
                                                    ${item.sales.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="text-gray-600 dark:text-gray-400">No hay datos de ventas disponibles</p>
                )}
            </div>

            {/* Contracts List */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
                <div className="p-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                        Pólizas ({contracts.length})
                    </h2>
                </div>
                {contracts.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
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
                                        Estado
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Fecha de Creación
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                                        Acciones
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                {contracts.map((contract) => (
                                    <tr
                                        key={contract.id}
                                        onClick={() => router.push(`/dashboard/contracts/${contract.id}`)}
                                        className="hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                            {contract.contract_number || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {contract.project_name || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {contract.insured_amount || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {contract.annual_premium || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${contract.status === 'PENDING'
                                                ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                : contract.status === 'APPROVED'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'
                                                }`}>
                                                {contract.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {contract.created_at
                                                ? new Date(contract.created_at).toLocaleDateString('es-MX')
                                                : 'N/A'}
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
                ) : (
                    <div className="p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400 text-lg">
                            No hay pólizas registradas para este asesor
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function ConsultantDetailsPage() {
    return (
        <ProtectedRoute allowedRoles={['promotory']}>
            <ConsultantDetailsPageContent />
        </ProtectedRoute>
    );
}
