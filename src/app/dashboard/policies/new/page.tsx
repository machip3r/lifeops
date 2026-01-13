'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Policy, Contract } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

// Define steps for each request type
const EMIT_STEPS = [
    { id: 'request_type', label: 'Tipo de Solicitud' },
    { id: 'client_info', label: 'Información del Cliente' },
    { id: 'contract_info', label: 'Información del Contrato' },
    { id: 'payment_info', label: 'Información de Pago' },
    { id: 'additional', label: 'Información Adicional' },
];

const CHANGE_STEPS = [
    { id: 'request_type', label: 'Tipo de Solicitud' },
    { id: 'policy_info', label: 'Información de la Póliza' },
    { id: 'change_details', label: 'Detalles del Cambio' },
    { id: 'payment_info', label: 'Información de Pago' },
    { id: 'additional', label: 'Información Adicional' },
];

const CORRECT_STEPS = [
    { id: 'request_type', label: 'Tipo de Solicitud' },
    { id: 'folio_info', label: 'Información del Folio' },
    { id: 'correction_details', label: 'Detalles de la Corrección' },
    { id: 'additional', label: 'Información Adicional' },
];

function NewRequestPageContent() {
    const router = useRouter();
    const { profile } = useAuth();
    const [currentStep, setCurrentStep] = useState(0);
    const [requestType, setRequestType] = useState<'EMIT' | 'CHANGE' | 'CORRECT' | null>(null);
    const [formData, setFormData] = useState<Partial<Policy>>({
        consultant_id: profile?.id || '',
        consultant_name: profile?.name || '',
        consultant_code: profile?.consultant_code || '',
        status: 'PENDING',
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    // Get steps based on request type
    const getSteps = () => {
        if (!requestType) return [];
        switch (requestType) {
            case 'EMIT':
                return EMIT_STEPS;
            case 'CHANGE':
                return CHANGE_STEPS;
            case 'CORRECT':
                return CORRECT_STEPS;
            default:
                return [];
        }
    };

    const steps = getSteps();
    const progress = requestType ? ((currentStep + 1) / steps.length) * 100 : 0;

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleRequestTypeSelect = (type: 'EMIT' | 'CHANGE' | 'CORRECT') => {
        setRequestType(type);
        setFormData(prev => ({ ...prev, request_type: type }));
        setCurrentStep(1); // Move to next step after selecting type
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            if (!requestType) {
                throw new Error('Por favor selecciona un tipo de solicitud');
            }

            const contractData: Omit<Contract, 'id' | 'created_at' | 'updated_at'> = {
                consultant_id: profile?.id || '',
                client_id: formData.client_full_name ? null : null, // TODO: Map to actual client_id if available
                contract_number: formData.contract_number || null,
                capture_date: formData.capture_date || null,
                project_name: formData.project_name || null,
                insured_amount: formData.insured_amount || null,
                annual_premium: formData.annual_premium || null,
                payment_method: formData.payment_method || null,
                currency: formData.currency || null,
                payment_channel: formData.collection_channel || null,
                folder_key: formData.drive_link || null,
                status: 'PENDING', // Required field, explicitly set as string
                metadata: {
                    request_type: requestType,
                    consultant_name: profile?.name || '',
                    consultant_code: profile?.consultant_code || '',
                    ...formData,
                },
            };

            await db.contract.createContract(contractData);

            // Redirect to policies page on success
            router.push('/dashboard/policies');
        } catch (error: any) {
            console.error('Error submitting form:', error);
            setErrorMessage(error.message || 'Error al guardar la información. Por favor, inténtalo de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepContent = () => {
        if (currentStep === 0) {
            // Step 1: Request Type Selection
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        ¿Qué tipo de solicitud deseas realizar?
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <button
                            type="button"
                            onClick={() => handleRequestTypeSelect('EMIT')}
                            className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-left"
                        >
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Emitir una Póliza
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                Registrar la emisión de una nueva póliza
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleRequestTypeSelect('CHANGE')}
                            className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-left"
                        >
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Hacer un Cambio
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                Registrar un cambio en una póliza existente
                            </p>
                        </button>
                        <button
                            type="button"
                            onClick={() => handleRequestTypeSelect('CORRECT')}
                            className="p-6 border-2 border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors text-left"
                        >
                            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Corregir un Folio
                            </h3>
                            <p className="text-gray-600 dark:text-gray-400">
                                Corregir información en un folio existente
                            </p>
                        </button>
                    </div>
                </div>
            );
        }

        if (!requestType) return null;

        // Step 2 and beyond based on request type
        const stepId = steps[currentStep]?.id;

        // EMIT Steps
        if (requestType === 'EMIT') {
            if (stepId === 'client_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información del Cliente
                        </h2>
                        <div>
                            <label htmlFor="client_full_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre Completo del Cliente *
                            </label>
                            <input
                                type="text"
                                id="client_full_name"
                                name="client_full_name"
                                value={formData.client_full_name || ''}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="project_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Nombre del Proyecto
                            </label>
                            <input
                                type="text"
                                id="project_name"
                                name="project_name"
                                value={formData.project_name || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'contract_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información del Contrato
                        </h2>
                        <div>
                            <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Número de Contrato
                            </label>
                            <input
                                type="text"
                                id="contract_number"
                                name="contract_number"
                                value={formData.contract_number || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="insured_amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Monto Asegurado
                            </label>
                            <input
                                type="text"
                                id="insured_amount"
                                name="insured_amount"
                                value={formData.insured_amount || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="annual_premium" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Prima Anual
                            </label>
                            <input
                                type="text"
                                id="annual_premium"
                                name="annual_premium"
                                value={formData.annual_premium || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'payment_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información de Pago
                        </h2>
                        <div>
                            <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Moneda
                            </label>
                            <select
                                id="currency"
                                name="currency"
                                value={formData.currency || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Selecciona una moneda</option>
                                <option value="MXN">MXN - Peso Mexicano</option>
                                <option value="USD">USD - Dólar Americano</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Método de Pago
                            </label>
                            <input
                                type="text"
                                id="payment_method"
                                name="payment_method"
                                value={formData.payment_method || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="payment_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Fecha de Pago
                            </label>
                            <input
                                type="date"
                                id="payment_date"
                                name="payment_date"
                                value={formData.payment_date || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'additional') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información Adicional
                        </h2>
                        <div>
                            <label htmlFor="drive_link" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Link de Google Drive
                            </label>
                            <input
                                type="url"
                                id="drive_link"
                                name="drive_link"
                                value={formData.drive_link || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="https://drive.google.com/..."
                            />
                        </div>
                        <div>
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Notas Adicionales
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                value={formData.notes || ''}
                                onChange={handleInputChange}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }
        }

        // CHANGE Steps
        if (requestType === 'CHANGE') {
            if (stepId === 'policy_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información de la Póliza
                        </h2>
                        <div>
                            <label htmlFor="policy_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Número de Póliza *
                            </label>
                            <input
                                type="text"
                                id="policy_number"
                                name="policy_number"
                                value={formData.policy_number || ''}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Número de Contrato
                            </label>
                            <input
                                type="text"
                                id="contract_number"
                                name="contract_number"
                                value={formData.contract_number || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'change_details') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Detalles del Cambio
                        </h2>
                        <div>
                            <label htmlFor="change_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Tipo de Cambio
                            </label>
                            <input
                                type="text"
                                id="change_type"
                                name="change_type"
                                value={formData.change_type || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="change_description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Descripción del Cambio *
                            </label>
                            <textarea
                                id="change_description"
                                name="change_description"
                                value={formData.change_description || ''}
                                onChange={handleInputChange}
                                required
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'payment_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información de Pago
                        </h2>
                        <div>
                            <label htmlFor="bank" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Banco
                            </label>
                            <input
                                type="text"
                                id="bank"
                                name="bank"
                                value={formData.bank || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="token_clabe" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                CLABE / Token
                            </label>
                            <input
                                type="text"
                                id="token_clabe"
                                name="token_clabe"
                                value={formData.token_clabe || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'additional') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información Adicional
                        </h2>
                        <div>
                            <label htmlFor="drive_link" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Link de Google Drive
                            </label>
                            <input
                                type="url"
                                id="drive_link"
                                name="drive_link"
                                value={formData.drive_link || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="https://drive.google.com/..."
                            />
                        </div>
                        <div>
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Notas Adicionales
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                value={formData.notes || ''}
                                onChange={handleInputChange}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }
        }

        // CORRECT Steps
        if (requestType === 'CORRECT') {
            if (stepId === 'folio_info') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información del Folio
                        </h2>
                        <div>
                            <label htmlFor="folio_to_correct" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Folio a Corregir *
                            </label>
                            <input
                                type="text"
                                id="folio_to_correct"
                                name="folio_to_correct"
                                value={formData.folio_to_correct || ''}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Número de Contrato
                            </label>
                            <input
                                type="text"
                                id="contract_number"
                                name="contract_number"
                                value={formData.contract_number || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'correction_details') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Detalles de la Corrección
                        </h2>
                        <div>
                            <label htmlFor="correction_description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Descripción de la Corrección *
                            </label>
                            <textarea
                                id="correction_description"
                                name="correction_description"
                                value={formData.correction_description || ''}
                                onChange={handleInputChange}
                                required
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }

            if (stepId === 'additional') {
                return (
                    <div className="space-y-6">
                        <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                            Información Adicional
                        </h2>
                        <div>
                            <label htmlFor="drive_link" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Link de Google Drive
                            </label>
                            <input
                                type="url"
                                id="drive_link"
                                name="drive_link"
                                value={formData.drive_link || ''}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                placeholder="https://drive.google.com/..."
                            />
                        </div>
                        <div>
                            <label htmlFor="notes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Notas Adicionales
                            </label>
                            <textarea
                                id="notes"
                                name="notes"
                                value={formData.notes || ''}
                                onChange={handleInputChange}
                                rows={4}
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>
                    </div>
                );
            }
        }

        return null;
    };

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    New Policy Request
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Complete the following steps to create a new policy request
                </p>
            </div>

            {/* Progress Bar */}
            {requestType && steps.length > 0 && (
                <div className="mb-8">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Paso {currentStep + 1} de {steps.length}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            {Math.round(progress)}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-2">
                        {steps.map((step, index) => (
                            <div
                                key={step.id}
                                className={`text-xs ${index <= currentStep
                                    ? 'text-blue-600 dark:text-blue-400 font-medium'
                                    : 'text-gray-500 dark:text-gray-400'
                                    }`}
                            >
                                {step.label}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Form Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <form onSubmit={currentStep === steps.length - 1 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
                    {renderStepContent()}

                    {/* Error Message */}
                    {errorMessage && (
                        <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-8">
                        <button
                            type="button"
                            onClick={currentStep === 0 ? () => router.push('/dashboard/policies') : handleBack}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            {currentStep === 0 ? 'Cancelar' : 'Atrás'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting || (currentStep === 0 && !requestType)}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting
                                ? 'Enviando...'
                                : currentStep === steps.length - 1
                                    ? 'Enviar Solicitud'
                                    : 'Siguiente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function NewRequestPage() {
    return (
        <ProtectedRoute allowedRoles={['consultant']}>
            <NewRequestPageContent />
        </ProtectedRoute>
    );
}

