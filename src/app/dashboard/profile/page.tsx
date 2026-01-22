'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import ProtectedRoute from '@/components/protected-route';

function ProfilePageContent() {
  const { profile, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (profile) {
      setName(profile.name || '');
      setEmail(profile.email || '');
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!profile) return;

    setSaving(true);
    setMessage(null);

    try {
      if (profile.role === 'promotory') {
        // Update office name
        await db.office.updateOffice(profile.id, { name });
      } else if (profile.role === 'consultant') {
        // getConsultantById searches by both id and auth_user_id
        const consultant = await db.consultant.getConsultantById(profile.id);
        if (!consultant) {
          throw new Error('Consultant not found');
        }
        // Use the consultant's actual id (not auth_user_id) for the update
        await db.consultant.updateConsultant(consultant.id, { name });
      }

      setMessage({ type: 'success', text: 'Nombre actualizado correctamente' });
      
      // Reload the page after a short delay to refresh profile data
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error: any) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.message || 'Error al actualizar el perfil' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">No se pudo cargar el perfil</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Perfil
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Gestiona la configuración y preferencias de tu perfil
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nombre
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Tu nombre"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Correo Electrónico
            </label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
              placeholder="tu.correo@ejemplo.com"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              El correo electrónico no se puede modificar
            </p>
          </div>

          {message && (
            <div className={`p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
            }`}>
              <p className={`text-sm ${
                message.type === 'success'
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-red-800 dark:text-red-200'
              }`}>
                {message.text}
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ProfilePageContent />
    </ProtectedRoute>
  );
}
