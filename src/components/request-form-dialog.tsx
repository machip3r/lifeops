'use client';

import { useState } from 'react';
import { Consultant, Policy } from '@/lib/supabase';
import { db } from '@/lib/db';

interface RequestFormDialogProps {
    consultant: Consultant;
    onClose: () => void;
}

export default function RequestFormDialog({ consultant, onClose }: RequestFormDialogProps) {
    const [formData, setFormData] = useState<Partial<Policy>>({
        request_type: undefined,
        consultant_id: consultant.id,
        consultant_name: consultant.name,
        consultant_code: consultant.consultant_code,
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitStatus, setSubmitStatus] = useState<'success' | 'error' | null>(null);
    const [errorMessage, setErrorMessage] = useState('');

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Request type is now a string, no need for text conversion

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setSubmitStatus(null);
        setErrorMessage('');

        try {
            if (!formData.request_type) {
                throw new Error('Por favor selecciona un tipo de solicitud');
            }

            const contractData: Omit<Policy, 'id' | 'created_at' | 'updated_at'> = {
                ...formData,
                request_type: formData.request_type as 'EMIT' | 'CHANGE' | 'CORRECT',
                consultant_id: consultant.id,
                consultant_name: consultant.name,
                consultant_code: consultant.consultant_code,
                status: 'PENDING',
            } as Omit<Policy, 'id' | 'created_at' | 'updated_at'>;

            try {
                await db.contract.createContract(contractData);
                setSubmitStatus('success');
                setTimeout(() => {
                    onClose();
                }, 1500);
            } catch (error: any) {
                console.error('Error submitting form:', error);
                setErrorMessage('Error al guardar la información. Por favor, inténtalo de nuevo.');
                setSubmitStatus('error');
            }
        } catch (error: any) {
            console.error('Error:', error);
            setErrorMessage(error.message || 'Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
            setSubmitStatus('error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            {/* Request Type */}
            <div>
                <label htmlFor="request_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ¿Qué necesitas? *
                </label>
                <select
                    id="request_type"
                    name="request_type"
                    value={formData.request_type || ''}
                    onChange={handleInputChange}
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                    <option value="">Selecciona una opción</option>
                    <option value="EMIT">Emitir una póliza / Registrar la emisión de una póliza</option>
                    <option value="CHANGE">Hacer un cambio / Registrar un cambio (de una póliza existente)</option>
                    <option value="CORRECT">Corregir un folio</option>
                </select>
            </div>

            {/* Type 1: Emit Policy Fields */}
            {formData.request_type === 'EMIT' && (
                <>
                    <div>
                        <label htmlFor="client_full_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Nombre Completo del Cliente
                        </label>
                        <input
                            type="text"
                            id="client_full_name"
                            name="client_full_name"
                            value={formData.client_full_name || ''}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </>
            )}

            {/* Type 2: Change Policy Fields */}
            {formData.request_type === 'CHANGE' && (
                <>
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label htmlFor="change_description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Descripción del Cambio
                        </label>
                        <textarea
                            id="change_description"
                            name="change_description"
                            value={formData.change_description || ''}
                            onChange={handleInputChange}
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </>
            )}

            {/* Type 3: Correct Folio Fields */}
            {formData.request_type === 'CORRECT' && (
                <>
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
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label htmlFor="correction_description" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Descripción de la Corrección
                        </label>
                        <textarea
                            id="correction_description"
                            name="correction_description"
                            value={formData.correction_description || ''}
                            onChange={handleInputChange}
                            rows={4}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                </>
            )}

            {/* Common Fields */}
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
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
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
                    rows={3}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
            </div>

            {/* Error Message */}
            {errorMessage && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
                </div>
            )}

            {/* Success Message */}
            {submitStatus === 'success' && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <p className="text-sm text-green-800 dark:text-green-200">
                        ¡Solicitud enviada exitosamente!
                    </p>
                </div>
            )}

            {/* Submit Button */}
            <div className="flex justify-end space-x-4">
                <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isSubmitting ? 'Enviando...' : 'Enviar Solicitud'}
                </button>
            </div>
        </form>
    );
}

