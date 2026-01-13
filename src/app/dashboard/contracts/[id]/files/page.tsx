'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Contract, File } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function ContractFilesPageContent() {
  const router = useRouter();
  const params = useParams();
  const contractId = params.id as string;
  const { profile } = useAuth();
  const [contract, setContract] = useState<Contract | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (contractId) {
      loadContract();
      loadFiles();
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
    } finally {
      setLoading(false);
    }
  };

  const loadFiles = async () => {
    try {
      // TODO: Implement file loading from contract metadata or file table
      // For now, this is a placeholder
      setFiles([]);
    } catch (error) {
      console.error('Error loading files:', error);
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
        <button
          onClick={() => router.push('/dashboard/contracts')}
          className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 mb-4"
        >
          ← Volver a Contratos
        </button>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Archivos del Contrato
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Contrato: {contract.contract_number || contract.folio_number || 'N/A'}
        </p>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
        {files.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">
              No hay archivos asociados a este contrato
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-500">
              La funcionalidad de carga y visualización de archivos se implementará próximamente
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {files.map((file) => (
              <div
                key={file.id}
                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {file.file_name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {file.file_type} • {file.file_size ? `${(file.file_size / 1024).toFixed(2)} KB` : 'N/A'}
                    </p>
                  </div>
                  {file.file_url && (
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                    >
                      Ver/Descargar
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ContractFilesPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ContractFilesPageContent />
    </ProtectedRoute>
  );
}

