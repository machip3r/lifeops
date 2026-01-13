'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, ContractChangeRequest } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function CorrectFolioPageContent() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  const { profile } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const [formData, setFormData] = useState<Partial<ContractChangeRequest>>({
    contract_id: contractId,
    request_type: 'CORRECT',
    folio_number: '',
    details: '',
    status: 'PENDING',
  });

  useEffect(() => {
    if (contractId) {
      loadContract();
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
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

      if (!formData.folio_number) {
        throw new Error('El folio a corregir es requerido');
      }

      if (!formData.details) {
        throw new Error('La descripción de las correcciones es requerida');
      }

      const changeRequestData: Omit<ContractChangeRequest, 'id' | 'created_at' | 'updated_at'> = {
        contract_id: contractId,
        request_type: 'CORRECT',
        folio_number: formData.folio_number,
        details: formData.details,
        notes: null,
        folder_key: null,
        status: 'PENDING',
        metadata: {},
      };

      await db.contractChangeRequest.createChangeRequest(changeRequestData);
      router.push('/dashboard/contracts');
    } catch (error: any) {
      console.error('Error creating correction request:', error);
      setErrorMessage(error.message || 'Error al crear la solicitud de corrección. Por favor, inténtalo de nuevo.');
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Corregir Folio
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Solicita la corrección del folio del contrato
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

          {/* Folio to Correct */}
          <div>
            <label htmlFor="folio_number" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Folio a Corregir *
            </label>
            <input
              type="text"
              id="folio_number"
              name="folio_number"
              value={formData.folio_number || ''}
              onChange={handleInputChange}
              required
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Correction Description */}
          <div>
            <label htmlFor="details" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Describe las correcciones o documentos adicionales que se requieren *
            </label>
            <textarea
              id="details"
              name="details"
              value={formData.details || ''}
              onChange={handleInputChange}
              required
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe detalladamente las correcciones necesarias..."
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

export default function CorrectFolioPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant']}>
      <CorrectFolioPageContent />
    </ProtectedRoute>
  );
}

