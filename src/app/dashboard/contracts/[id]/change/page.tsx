'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractChangeRequest, Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

const CHANGE_TYPES = [
  'Cambio Agente',
  'Forma de pago',
  'Domicilio',
  'Contratante',
  'Disminución de SA',
  'Inclusión/exclusión de coberturas',
  'Corrección de Nombre, Sexo, Fecha de nacimiento, etc.',
  'Rehabilitación primeros 90 días',
  'Alta/Cambio/Baja de Cargo Automático',
  'Otro',
];

function ContractChangeRequestPageContent() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  const { profile } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState<Partial<ContractChangeRequest>>({
    contract_id: contractId,
    request_type: 'CHANGE',
    folio_number: '',
    details: '',
    notes: '',
    folder_key: '',
    status: 'PENDING',
  });

  const [changeType, setChangeType] = useState('');
  const [otherChangeType, setOtherChangeType] = useState('');

  useEffect(() => {
    if (contractId) {
      loadContract();
      loadClients();
    }
  }, [contractId]);

  const loadContract = async () => {
    try {
      const contractData = await db.contract.getContractById(contractId);
      if (!contractData) {
        throw new Error('Contrato no encontrado');
      }
      setContract(contractData);
    } catch (error) {
      console.error('Error loading contract:', error);
      setErrorMessage('Error al cargar el contrato');
    } finally {
      setLoading(false);
    }
  };

  const loadClients = async () => {
    try {
      let clientsData: Client[];
      if (profile?.role === 'consultant' && profile.id) {
        // Consultants can only see clients they have contracts with
        clientsData = await db.client.getClientsByConsultant(profile.id);
      } else {
        // Promotory users can see all clients
        clientsData = await db.client.getAllClients();
      }
      setClients(clientsData);
    } catch (error) {
      console.error('Error loading clients:', error);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      if (!contract) {
        throw new Error('Contrato no encontrado');
      }

      const changeTypeText = changeType === 'Otro' ? otherChangeType : changeType;
      const detailsText = `Tipo de cambio: ${changeTypeText}\n\n${formData.details || ''}`;

      const changeRequestData: Omit<ContractChangeRequest, 'id' | 'created_at' | 'updated_at'> = {
        contract_id: contractId,
        request_type: 'CHANGE',
        folio_number: formData.folio_number || null,
        details: detailsText,
        notes: formData.notes || null,
        folder_key: formData.folder_key || null,
        status: 'PENDING',
        metadata: {},
      };

      await db.contractChangeRequest.createChangeRequest(changeRequestData);
      router.push('/dashboard/contracts');
    } catch (error: any) {
      console.error('Error creating change request:', error);
      setErrorMessage(error.message || 'Error al crear la solicitud de cambio. Por favor, inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Contrato no encontrado</p>
      </div>
    );
  }

  const selectedClient = clients.find(c => c.id === contract.client_id);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Solicitar Cambio de Contrato
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Completa la información para solicitar un cambio en el contrato
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Consultant Info (Read-only) */}
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <p className="text-sm text-gray-600 dark:text-gray-400">Clave de Asesor:</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {profile?.consultant_code || 'N/A'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">Nombre de Asesor:</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {profile?.name || 'N/A'}
            </p>
          </div>

          {/* Contract Info Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="folio_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Folio (Solo si lo creaste por central o por OV propia)
              </label>
              <input
                type="text"
                id="folio_number"
                name="folio_number"
                value={formData.folio_number || ''}
                onChange={handleInputChange}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="capture_date" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Fecha de Captura (si es que creaste el folio)
              </label>
              <input
                type="date"
                id="capture_date"
                name="capture_date"
                value={contract.capture_date || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label htmlFor="contract_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Número de Póliza
              </label>
              <input
                type="text"
                id="contract_number"
                name="contract_number"
                value={contract.contract_number || ''}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre Completo del Cliente
              </label>
              <input
                type="text"
                value={selectedClient?.name || 'N/A'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Nombre del Proyecto
              </label>
              <input
                type="text"
                value={contract.project_name || 'N/A'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Suma Asegurada
              </label>
              <input
                type="text"
                value={contract.insured_amount || 'N/A'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Moneda
              </label>
              <input
                type="text"
                value={contract.currency || 'N/A'}
                disabled
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-400"
              />
            </div>
          </div>

          {/* Change Type */}
          <div>
            <label htmlFor="change_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Cambio o trámite que deseas hacer *
            </label>
            <select
              id="change_type"
              value={changeType}
              onChange={(e) => setChangeType(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Selecciona un tipo de cambio</option>
              {CHANGE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {changeType === 'Otro' && (
            <div>
              <label htmlFor="other_change_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Especifica el tipo de cambio *
              </label>
              <input
                type="text"
                id="other_change_type"
                value={otherChangeType}
                onChange={(e) => setOtherChangeType(e.target.value)}
                required={changeType === 'Otro'}
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Change Description */}
          <div>
            <label htmlFor="details" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Descripción del CAMBIO/CAMBIOS y motivo *
            </label>
            <textarea
              id="details"
              name="details"
              value={formData.details || ''}
              onChange={handleInputChange}
              required
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe detalladamente los cambios que deseas realizar y el motivo..."
            />
          </div>

          {/* Files Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Subir Archivos
            </label>
            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
              <input
                type="file"
                multiple
                className="hidden"
                id="file-upload"
                onChange={(e) => {
                  console.log('Files selected:', e.target.files);
                }}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                Haz clic para seleccionar archivos o arrastra y suelta aquí
              </label>
            </div>
          </div>

          {errorMessage && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
            </div>
          )}

          <div className="flex justify-end gap-4 pt-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard/contracts')}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
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
      </div>
    </div>
  );
}

export default function ContractChangeRequestPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant']}>
      <ContractChangeRequestPageContent />
    </ProtectedRoute>
  );
}

