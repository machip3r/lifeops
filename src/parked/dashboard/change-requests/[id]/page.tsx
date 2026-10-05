'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ContractChangeRequest, Contract, Client } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function ChangeRequestDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const requestId = params.id as string;
  const { profile } = useAuth();
  const [changeRequest, setChangeRequest] = useState<ContractChangeRequest | null>(null);
  const [contract, setContract] = useState<Contract | null>(null);
  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (requestId) {
      loadData();
    }
  }, [requestId]);

  const loadData = async () => {
    try {
      const requestData = await db.contractChangeRequest.getChangeRequestById(requestId);
      if (!requestData) {
        throw new Error('Solicitud no encontrada');
      }
      setChangeRequest(requestData);

      const contractData = await db.contract.getContractById(requestData.contract_id);
      if (contractData) {
        setContract(contractData);
        if (contractData.client_id) {
          // Use getClientById instead of loading all clients
          const clientData = await db.client.getClientById(contractData.client_id);
          if (clientData) {
            setClient(clientData);
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setErrorMessage('Error al cargar los datos');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!confirm('¿Estás seguro de que quieres aprobar esta solicitud?')) return;

    setIsProcessing(true);
    setErrorMessage('');

    try {
      await db.contractChangeRequest.updateChangeRequest(requestId, {
        status: 'APPROVED',
      });
      router.push('/dashboard/change-requests');
    } catch (error: any) {
      console.error('Error approving request:', error);
      setErrorMessage(error.message || 'Error al aprobar la solicitud');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!confirm('¿Estás seguro de que quieres rechazar esta solicitud?')) return;

    setIsProcessing(true);
    setErrorMessage('');

    try {
      await db.contractChangeRequest.updateChangeRequest(requestId, {
        status: 'REJECTED',
      });
      router.push('/dashboard/change-requests');
    } catch (error: any) {
      console.error('Error rejecting request:', error);
      setErrorMessage(error.message || 'Error al rechazar la solicitud');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!changeRequest || !contract) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Solicitud no encontrada</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <button
          onClick={() => router.push('/dashboard/change-requests')}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-4"
        >
          ← Volver a Solicitudes
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Detalles de la Solicitud
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {changeRequest.request_type === 'CHANGE' ? 'Solicitud de Cambio' : 'Solicitud de Corrección'}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 space-y-6">
        {/* Status Badge */}
        <div className="flex items-center justify-between">
          <div>
            <span className={`px-3 py-1 inline-flex text-sm leading-5 font-semibold rounded-full ${
              changeRequest.status === 'APPROVED'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : changeRequest.status === 'REJECTED'
                ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
            }`}>
              {changeRequest.status}
            </span>
          </div>
          {profile?.role === 'promotory' && changeRequest.status === 'PENDING' && (
            <div className="flex gap-4">
              <button
                onClick={handleReject}
                disabled={isProcessing}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Rechazar
              </button>
              <button
                onClick={handleApprove}
                disabled={isProcessing}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                Aprobar
              </button>
            </div>
          )}
        </div>

        {/* Contract Information */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Información del Contrato
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Folio:</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {changeRequest.folio_number || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Número de Contrato:</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {contract.contract_number || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Cliente:</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {client?.name || 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Proyecto:</p>
              <p className="text-lg font-medium text-gray-900 dark:text-white">
                {contract.project_name || 'N/A'}
              </p>
            </div>
          </div>
        </div>

        {/* Change Request Details */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Detalles de la Solicitud
          </h2>
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Descripción:</p>
            <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
              <p className="text-gray-900 dark:text-white whitespace-pre-wrap">
                {changeRequest.details || 'N/A'}
              </p>
            </div>
          </div>
          {changeRequest.notes && (
            <div className="mt-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Notas:</p>
              <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
                <p className="text-gray-900 dark:text-white">
                  {changeRequest.notes}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Files Section */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Archivos
          </h2>
          <div className="bg-gray-50 dark:bg-gray-700 p-4 rounded-lg">
            <p className="text-gray-600 dark:text-gray-400">
              Los archivos se mostrarán aquí cuando se implemente la funcionalidad de carga.
            </p>
          </div>
        </div>

        {/* Metadata */}
        <div className="border-t border-gray-200 dark:border-gray-700 pt-6">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Fecha de creación: {changeRequest.created_at
              ? new Date(changeRequest.created_at).toLocaleString('es-MX')
              : 'N/A'}
          </p>
          {changeRequest.updated_at && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Última actualización: {new Date(changeRequest.updated_at).toLocaleString('es-MX')}
            </p>
          )}
        </div>

        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <p className="text-sm text-red-800 dark:text-red-200">{errorMessage}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChangeRequestDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ChangeRequestDetailsPageContent />
    </ProtectedRoute>
  );
}

