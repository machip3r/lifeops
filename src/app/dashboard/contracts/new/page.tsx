'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Contract, Consultant, Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

const STEPS = [
    { id: 'consultant', label: 'Información del Asesor' },
    { id: 'folio', label: 'Información del Folio' },
    { id: 'client', label: 'Cliente' },
    { id: 'contract', label: 'Detalles del Contrato' },
    { id: 'payment', label: 'Información de Pago' },
    { id: 'files', label: 'Archivos' },
];

function NewContractPageContent() {
    const router = useRouter();
    const { profile } = useAuth();
    const [consultants, setConsultants] = useState<Consultant[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');
    const [showNewClientForm, setShowNewClientForm] = useState(false);
    const [newClientData, setNewClientData] = useState({ name: '', birth_date: '' });

    const [formData, setFormData] = useState<Partial<Contract>>({
        consultant_id: '',
        client_id: '',
        contract_number: '',
        capture_date: '',
        project_name: '',
        insured_amount: '',
        annual_premium: '',
        payment_method: '',
        currency: '',
        payment_channel: '',
        folder_key: '',
        status: 'PENDING',
    });

    const progress = ((currentStep + 1) / STEPS.length) * 100;

    useEffect(() => {
        if (profile?.role === 'promotory' && profile.id) {
            loadData();
        } else if (profile?.role === 'consultant') {
            loadClients();
            setFormData(prev => ({ ...prev, consultant_id: profile.id }));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [profile]);

    const loadData = async () => {
        try {
            if (!profile?.id) return;

            const consultantsData = await db.consultant.getConsultantsByOffice(profile.id);
            // Show all consultants (ACTIVE, PENDING, INACTIVE)
            // Previously was filtering to only ACTIVE, which excluded PENDING consultants
            setConsultants(consultantsData);

            const officeId = profile?.role === 'promotory' ? profile?.id : profile?.office_id;
            const clientsData = await db.client.getAllClients(officeId);
            setClients(clientsData);
        } catch (error) {
            console.error('Error loading data:', error);
            setErrorMessage('Error al cargar los datos. Por favor, recarga la página.');
        } finally {
            setLoading(false);
        }
    };

    const loadClients = async () => {
        try {
            let clientsData: Client[];
            if (profile?.role === 'consultant' && profile.id) {
                clientsData = await db.client.getClientsByConsultant(profile.id);
            } else {
                clientsData = await db.client.getAllClients(profile?.role === 'promotory' ? profile?.id : undefined);
            }
            setClients(clientsData);
        } catch (error) {
            console.error('Error loading clients:', error);
            setErrorMessage('Error al cargar los clientes. Por favor, recarga la página.');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNewClientInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        setNewClientData(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateNewClient = async () => {
        try {
            if (!newClientData.name.trim()) {
                throw new Error('El nombre del cliente es requerido');
            }

            const officeId = profile?.role === 'promotory' ? profile?.id : profile?.office_id;
            const newClient = await db.client.createClient(newClientData.name, newClientData.birth_date || undefined, officeId ?? undefined);
            setClients(prev => [...prev, newClient]);
            setFormData(prev => ({ ...prev, client_id: newClient.id }));
            setShowNewClientForm(false);
            setNewClientData({ name: '', birth_date: '' });
        } catch (error: any) {
            setErrorMessage(error.message || 'Error al crear el cliente');
        }
    };

    const handleNext = () => {
        if (currentStep < STEPS.length - 1) {
            setCurrentStep(prev => prev + 1);
        }
    };

    const handleBack = () => {
        if (currentStep > 0) {
            setCurrentStep(prev => prev - 1);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMessage('');

        try {
            if (!profile?.id) {
                throw new Error('No se pudo identificar el usuario');
            }

            const consultantId = profile.role === 'consultant' ? profile.id : formData.consultant_id;
            if (!consultantId) {
                throw new Error('No se pudo identificar el asesor');
            }

            if (!formData.client_id) {
                throw new Error('Por favor selecciona un cliente');
            }

            const contractData: Omit<Contract, 'id' | 'created_at' | 'updated_at'> = {
                consultant_id: consultantId,
                client_id: formData.client_id || null,
                contract_number: formData.contract_number || null,
                capture_date: formData.capture_date || null,
                project_name: formData.project_name || null,
                insured_amount: formData.insured_amount || null,
                annual_premium: formData.annual_premium || null,
                payment_method: formData.payment_method || null,
                currency: formData.currency || null,
                payment_channel: formData.payment_channel || null,
                folder_key: formData.folder_key || null,
                status: 'PENDING',
                metadata: {},
            };

            await db.contract.createContract(contractData);
            router.push('/dashboard/contracts');
        } catch (error: any) {
            console.error('Error creating contract:', error);
            setErrorMessage(error.message || 'Error al crear la póliza. Por favor, inténtalo de nuevo.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderStepContent = () => {
        const stepId = STEPS[currentStep]?.id;

        // Step 1: Consultant Info
        if (stepId === 'consultant') {
            const selectedConsultant = profile?.role === 'promotory'
                ? consultants.find(c => c.id === formData.consultant_id)
                : profile;

            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Información del Asesor
                    </h2>
                    {profile?.role === 'promotory' ? (
                        <div>
                            <label htmlFor="consultant_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Clave de Asesor *
                            </label>
                            <select
                                id="consultant_id"
                                name="consultant_id"
                                value={formData.consultant_id}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="">Selecciona un asesor</option>
                                {consultants.map((consultant) => (
                                    <option key={consultant.id} value={consultant.id}>
                                        {consultant.consultant_code} - {consultant.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    ) : null}

                    {selectedConsultant && (
                        <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                            <p className="text-sm text-gray-600 dark:text-gray-400">Clave de Asesor:</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                {profile?.role === 'promotory'
                                    ? (selectedConsultant as Consultant).consultant_code
                                    : (profile as any).consultant_code}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Nombre de Asesor:</p>
                            <p className="text-lg font-semibold text-gray-900 dark:text-white">
                                {selectedConsultant.name}
                            </p>
                        </div>
                    )}
                </div>
            );
        }

        // Step 2: Contract Info
        if (stepId === 'folio') {
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Información del Contrato
                    </h2>
                    <div>
                        <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Número de Contrato (Poliza) *
                        </label>
                        <input
                            type="text"
                            id="contract_number"
                            name="contract_number"
                            value={formData.contract_number || ''}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Ingresa el número de póliza"
                        />
                    </div>
                    <div>
                        <label htmlFor="capture_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Fecha de Captura
                        </label>
                        <input
                            type="date"
                            id="capture_date"
                            name="capture_date"
                            value={formData.capture_date || ''}
                            onChange={handleInputChange}
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                    </div>
                </div>
            );
        }

        // Step 3: Client Selection/Creation
        if (stepId === 'client') {
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Cliente
                    </h2>
                    {!showNewClientForm ? (
                        <>
                            <div>
                                <label htmlFor="client_id" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Nombre COMPLETO del Cliente *
                                </label>
                                <select
                                    id="client_id"
                                    name="client_id"
                                    value={formData.client_id || ''}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                >
                                    <option value="">Selecciona un cliente</option>
                                    {clients.map((client) => (
                                        <option key={client.id} value={client.id}>
                                            {client.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="text-center">
                                <button
                                    type="button"
                                    onClick={() => setShowNewClientForm(true)}
                                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                >
                                    + Crear nuevo cliente
                                </button>
                            </div>
                        </>
                    ) : (
                        <div className="space-y-4 bg-gray-50 dark:bg-gray-700 p-6 rounded-lg">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Nuevo Cliente</h3>
                            <div>
                                <label htmlFor="new_client_name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Nombre Completo *
                                </label>
                                <input
                                    type="text"
                                    id="new_client_name"
                                    name="name"
                                    value={newClientData.name}
                                    onChange={handleNewClientInputChange}
                                    required
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div>
                                <label htmlFor="new_client_birth_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Fecha de Nacimiento
                                </label>
                                <input
                                    type="date"
                                    id="new_client_birth_date"
                                    name="birth_date"
                                    value={newClientData.birth_date}
                                    onChange={handleNewClientInputChange}
                                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                />
                            </div>
                            <div className="flex gap-4">
                                <button
                                    type="button"
                                    onClick={handleCreateNewClient}
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                                >
                                    Crear Cliente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowNewClientForm(false);
                                        setNewClientData({ name: '', birth_date: '' });
                                    }}
                                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600"
                                >
                                    Cancelar
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            );
        }

        // Step 4: Contract Details
        if (stepId === 'contract') {
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Detalles del Contrato
                    </h2>
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
                    <div>
                        <label htmlFor="insured_amount" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Suma Asegurada
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
                            Prima Anual (lo que ahorra el cliente en pesos al año)
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

        // Step 5: Payment Info
        if (stepId === 'payment') {
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Información de Pago
                    </h2>
                    <div>
                        <label htmlFor="payment_method" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Forma de Pago *
                        </label>
                        <select
                            id="payment_method"
                            name="payment_method"
                            value={formData.payment_method || ''}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="">Selecciona una forma de pago</option>
                            <option value="Anual">Anual</option>
                            <option value="Semestral">Semestral</option>
                            <option value="Trimestral">Trimestral</option>
                            <option value="Mensual">Mensual</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="currency" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Moneda *
                        </label>
                        <select
                            id="currency"
                            name="currency"
                            value={formData.currency || ''}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="">Selecciona una moneda</option>
                            <option value="Udis">Udis</option>
                            <option value="Dollars">Dólares</option>
                            <option value="Pesos">Pesos</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="payment_channel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Conducto de Cobro *
                        </label>
                        <select
                            id="payment_channel"
                            name="payment_channel"
                            value={formData.payment_channel || ''}
                            onChange={handleInputChange}
                            required
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        >
                            <option value="">Selecciona un conducto de cobro</option>
                            <option value="Agente">Agente</option>
                            <option value="Cargo Automático">Cargo Automático</option>
                        </select>
                    </div>
                </div>
            );
        }

        // Step 6: Files
        if (stepId === 'files') {
            return (
                <div className="space-y-6">
                    <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                        Archivos
                    </h2>
                    <div>
                        <label htmlFor="file-upload" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Subir Archivos
                        </label>
                        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                            <input
                                type="file"
                                multiple
                                className="hidden"
                                id="file-upload"
                                onChange={(e) => {
                                    // File upload logic will be implemented
                                    console.log('Files selected:', e.target.files);
                                }}
                            />
                            <label
                                htmlFor="file-upload"
                                className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                            >
                                Haz clic para seleccionar archivos o arrastra y suelta aquí
                            </label>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                                Puedes subir múltiples archivos
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return null;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <div className="mb-8">
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                    {profile?.role === 'promotory' ? 'Registrar Emisión' : 'Emitir Contrato'}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                    Completa los siguientes pasos para crear un nueva póliza
                </p>
            </div>

            {/* Progress Bar */}
            <div className="mb-8">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Paso {currentStep + 1} de {STEPS.length}
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
                    {STEPS.map((step, index) => (
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

            {/* Form Content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
                <form onSubmit={currentStep === STEPS.length - 1 ? handleSubmit : (e) => { e.preventDefault(); handleNext(); }}>
                    {renderStepContent()}

                    {errorMessage && (
                        <div className="mt-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
                        </div>
                    )}

                    {/* Navigation Buttons */}
                    <div className="flex justify-between mt-8">
                        <button
                            type="button"
                            onClick={currentStep === 0 ? () => router.push('/dashboard/contracts') : handleBack}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            {currentStep === 0 ? 'Cancelar' : 'Atrás'}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting
                                ? 'Creando...'
                                : currentStep === STEPS.length - 1
                                    ? 'Crear Contrato'
                                    : 'Siguiente'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function NewContractPage() {
    return (
        <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
            <NewContractPageContent />
        </ProtectedRoute>
    );
}
