'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase, Policy } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';

function PoliciesPageContent() {
  const router = useRouter();
  const { profile } = useAuth();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [formData, setFormData] = useState<Partial<Policy>>({
    request_type: 'EMIT',
    consultant_id: profile?.id || '',
    consultant_name: profile?.name || '',
    consultant_code: profile?.consultant_code || '',
    status: 'PENDING',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [otherChangeType, setOtherChangeType] = useState('');

  const loadPolicies = useCallback(async () => {
    try {
      if (!profile?.id) return;

      const data = await db.contract.getContractsByConsultant(profile.id);
      setPolicies(data as Policy[]);
    } catch (error) {
      console.error('Error loading policies:', error);
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    if (profile?.role === 'consultant') {
      loadPolicies();
    }
  }, [profile, loadPolicies]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleRequestTypeChange = (type: 'EMIT' | 'CHANGE' | 'CORRECT') => {
    setFormData(prev => ({
      ...prev,
      request_type: type
    }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 6 * 1024 * 1024) {
        alert('El archivo debe pesar menos de 6MB');
        return;
      }
      setSelectedFile(file);
    }
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `consultants/${fileName}`;

      const { error } = await supabase.storage
        .from('consultants-files')
        .upload(filePath, file);

      if (error) throw error;

      const { data } = supabase.storage
        .from('consultants-files')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Error uploading file:', error);
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let driveLink = formData.drive_link;

      if (selectedFile) {
        const fileUrl = await uploadFile(selectedFile);
        if (fileUrl) {
          driveLink = fileUrl;
        }
      }

      const policy: Policy = {
        ...formData,
        consultant_id: profile?.id || '',
        consultant_name: formData.consultant_name || profile?.name || '',
        consultant_code: formData.consultant_code || profile?.consultant_code || '',
        drive_link: driveLink,
      } as Policy;

      if (editingPolicy?.id) {
        // Update
        await db.contract.updateContract(editingPolicy.id, policy);
        setEditingPolicy(null);
        resetForm();
        loadPolicies();
      }
    } catch (error) {
      console.error('Error saving policy:', error);
      alert('Error al guardar la póliza');
    }
  };

  const resetForm = () => {
    setFormData({
      request_type: 'EMIT',
      consultant_id: profile?.id || '',
      consultant_name: profile?.name || '',
      consultant_code: profile?.consultant_code || '',
      status: 'pending',
    });
    setSelectedFile(null);
    setOtherChangeType('');
  };

  const handleEdit = (policy: Policy) => {
    setEditingPolicy(policy);
    setFormData(policy);

    // Check if change_type is not one of the predefined options
    const predefinedOptions = [
      'Cambio Agente, Forma de pago, Domicilio, Contratante, etc.',
      'Disminución de SA',
      'Inclusión/exclusión de coberturas',
      'Corrección de Nombre, Sexo, Fecha de nacimiento, etc.',
      'Rehabilitación primeros 90 días',
      'Alta/Cambio/Baja de Cargo Automático',
    ];

    if (policy.change_type && !predefinedOptions.includes(policy.change_type)) {
      setOtherChangeType(policy.change_type);
      setFormData(prev => ({ ...prev, change_type: 'Otro' }));
    } else {
      setOtherChangeType('');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar esta póliza?')) return;

    try {
      await db.contract.deleteContract(id);

      loadPolicies();
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('Error al eliminar la póliza');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            Contratos
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Gestiona tus contratos y procedimientos
          </p>
        </div>
        <button
          onClick={() => router.push('/dashboard/policies/new')}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
        >
          + Nuevo Contrato
        </button>
      </div>

      {/* Edit Form Modal */}
      {editingPolicy && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 my-8">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                Editar Contrato
              </h2>
              <button
                onClick={() => {
                  setEditingPolicy(null);
                  resetForm();
                }}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Request Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Tipo de Solicitud *
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <button
                    type="button"
                    onClick={() => handleRequestTypeChange('EMIT')}
                    className={`px-4 py-3 rounded-lg border-2 transition-colors ${formData.request_type === 'EMIT'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    Emitir Póliza
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRequestTypeChange('CHANGE')}
                    className={`px-4 py-3 rounded-lg border-2 transition-colors ${formData.request_type === 'CHANGE'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    Hacer Cambio
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRequestTypeChange('CORRECT')}
                    className={`px-4 py-3 rounded-lg border-2 transition-colors ${formData.request_type === 'CORRECT'
                      ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                      : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'
                      }`}
                  >
                    Corregir Folio
                  </button>
                </div>
              </div>

              {/* Common Fields */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Código del Consultor
                  </label>
                  <input
                    type="text"
                    name="consultant_code"
                    value={formData.consultant_code || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Número de Folio
                  </label>
                  <input
                    type="text"
                    name="contract_number"
                    value={formData.contract_number || ''}
                    onChange={handleInputChange}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Type 1: Emit Policy Fields */}
              {formData.request_type === 'EMIT' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Estado del Contrato
                      </label>
                      <select
                        name="contract_number_status"
                        value={formData.contract_number_status || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="ACEPTADO/PAGADO">Aceptado/Pagado</option>
                        <option value="TERMINADO">Terminado</option>
                        <option value="RECHAZADO">Rechazado</option>
                        <option value="ACEPTADO/PAGADO GMM">Aceptado/Pagado GMM</option>
                        <option value="TERMINADO GMM">Terminado GMM</option>
                        <option value="RECHAZADO GMM">Rechazado GMM</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Fecha de Captura
                      </label>
                      <input
                        type="date"
                        name="capture_date"
                        value={formData.capture_date || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre Completo del Cliente
                    </label>
                    <input
                      type="text"
                      name="client_full_name"
                      value={formData.client_full_name || ''}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre del Proyecto
                    </label>
                    <input
                      type="text"
                      name="project_name"
                      value={formData.project_name || ''}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Suma Asegurada
                      </label>
                      <input
                        type="text"
                        name="insured_amount"
                        value={formData.insured_amount || ''}
                        onChange={handleInputChange}
                        placeholder="$45,000.00"
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Prima Anual
                      </label>
                      <input
                        type="text"
                        name="annual_premium"
                        value={formData.annual_premium || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Método de Pago
                      </label>
                      <select
                        name="payment_method"
                        value={formData.payment_method || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Anual">Anual</option>
                        <option value="Semestral">Semestral</option>
                        <option value="Mensual">Monthly</option>
                        <option value="Trimestral">Trimesterly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Moneda
                      </label>
                      <select
                        name="currency"
                        value={formData.currency || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Udis">UDIS</option>
                        <option value="Pesos">Pesos Mexicanos</option>
                        <option value="Dolares">Dólares</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Canal de Pago
                      </label>
                      <select
                        name="collection_channel"
                        value={formData.collection_channel || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="">Seleccionar...</option>
                        <option value="Agente">Agente</option>
                        <option value="Cargo Automático">Cargo Automático</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {/* Type 2: Change Policy Fields */}
              {formData.request_type === 'CHANGE' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Número de Contrato *
                    </label>
                    <input
                      type="text"
                      name="policy_number"
                      value={formData.policy_number || ''}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Nombre Completo del Cliente
                    </label>
                    <input
                      type="text"
                      name="client_full_name"
                      value={formData.client_full_name || ''}
                      onChange={handleInputChange}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Cambio o trámite que deseas hacer
                    </label>
                    <select
                      name="change_type"
                      value={formData.change_type || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData(prev => ({ ...prev, change_type: value }));
                        if (value !== 'Otro') {
                          setOtherChangeType('');
                        }
                      }}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Selecciona un tipo de cambio</option>
                      <option value="Cambio Agente, Forma de pago, Domicilio, Contratante, etc.">
                        Cambio Agente, Forma de pago, Domicilio, Contratante, etc.
                      </option>
                      <option value="Disminución de SA">Disminución de SA</option>
                      <option value="Inclusión/exclusión de coberturas">
                        Inclusión/exclusión de coberturas
                      </option>
                      <option value="Corrección de Nombre, Sexo, Fecha de nacimiento, etc.">
                        Corrección de Nombre, Sexo, Fecha de nacimiento, etc.
                      </option>
                      <option value="Rehabilitación primeros 90 días">
                        Rehabilitación primeros 90 días
                      </option>
                      <option value="Alta/Cambio/Baja de Cargo Automático">
                        Alta/Cambio/Baja de Cargo Automático
                      </option>
                      <option value="Otro">Otro</option>
                    </select>
                  </div>

                  {formData.change_type === 'Otro' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Especifica el tipo de cambio
                      </label>
                      <input
                        type="text"
                        value={otherChangeType}
                        onChange={(e) => {
                          setOtherChangeType(e.target.value);
                          setFormData(prev => ({ ...prev, change_type: e.target.value }));
                        }}
                        placeholder="Describe el tipo de cambio..."
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descripción y Motivo
                    </label>
                    <textarea
                      name="change_description"
                      value={formData.change_description || ''}
                      onChange={handleInputChange}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Banco
                      </label>
                      <input
                        type="text"
                        name="bank"
                        value={formData.bank || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        TOKEN/CLABE
                      </label>
                      <input
                        type="text"
                        name="token_clabe"
                        value={formData.token_clabe || ''}
                        onChange={handleInputChange}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Type 3: Correct Folio Fields */}
              {formData.request_type === 'CORRECT' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Número de Folio a Corregir *
                    </label>
                    <input
                      type="text"
                      name="folio_to_correct"
                      value={formData.folio_to_correct || ''}
                      onChange={handleInputChange}
                      required
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descripción de los cambios
                    </label>
                    <textarea
                      name="correction_description"
                      value={formData.correction_description || ''}
                      onChange={handleInputChange}
                      rows={4}
                      className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                  </div>
                </>
              )}

              {/* File Upload */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Documento adjunto (opcional)
                </label>
                <input
                  type="file"
                  onChange={handleFileChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  * Máximo 6MB, sin caracteres especiales en el nombre
                </p>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Estado
                </label>
                <select
                  name="status"
                  value={formData.status || 'pending'}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="pending">Pendiente</option>
                  <option value="in_progress">En Progreso</option>
                  <option value="completed">Completado</option>
                  <option value="terminado">Terminado</option>
                  <option value="aceptado_pagado">Aceptado/Pagado</option>
                  <option value="rechazado">Rechazado</option>
                  <option value="correccion_hecha">Corrección Hecha</option>
                </select>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Notas Adicionales
                </label>
                <textarea
                  name="notes"
                  value={formData.notes || ''}
                  onChange={handleInputChange}
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setEditingPolicy(null);
                    resetForm();
                  }}
                  className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingPolicy ? 'Actualizar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Policies List */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden">
        {policies.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            No hay contratos registrados. Crea tu primer contrato
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Folio/Póliza</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cliente</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Estado</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {policies.map((policy) => (
                  <tr key={policy.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {policy.request_type === 'EMIT' && 'Emitir'}
                      {policy.request_type === 'CHANGE' && 'Cambio'}
                      {policy.request_type === 'CORRECT' && 'Corregir'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {policy.contract_number || policy.policy_number || policy.folio_to_correct || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                      {policy.client_full_name || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${policy.status === 'completed' || policy.status === 'terminado' || policy.status === 'aceptado_pagado'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                        policy.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                          policy.status === 'rejected' || policy.status === 'rechazado'
                            ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' :
                            policy.status === 'correccion_hecha'
                              ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' :
                              'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                        }`}>
                        {policy.contract_number_status || policy.status || 'PENDING'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {policy.created_at ? new Date(policy.created_at).toLocaleDateString() : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <button
                        onClick={() => handleEdit(policy)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 mr-4"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => policy.id && handleDelete(policy.id)}
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function PoliciesPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant']}>
      <PoliciesPageContent />
    </ProtectedRoute>
  );
}
