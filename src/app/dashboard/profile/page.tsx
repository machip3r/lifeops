'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/dashboard/page-header';

function ProfilePageContent() {
  const { profile, loading: authLoading } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const profileKey = profile
    ? `${profile.id}\0${profile.name ?? ''}\0${profile.email ?? ''}`
    : '';
  const [seenProfileKey, setSeenProfileKey] = useState(profileKey);
  if (profile && seenProfileKey !== profileKey) {
    setSeenProfileKey(profileKey);
    setName(profile.name || '');
    setEmail(profile.email || '');
  }

  const officeId = profile?.role === 'consultant' ? (profile.office_id ?? '') : '';
  const [office, setOffice] = useState<{ id: string; name: string | null } | null>(null);
  const officeName = office?.id === officeId ? office.name : null;

  useEffect(() => {
    if (!officeId) return;
    let cancelled = false;
    void (async () => {
      try {
        const row = await db.office.getOfficeById(officeId);
        if (!cancelled) setOffice({ id: officeId, name: row?.name?.trim() || null });
      } catch {
        if (!cancelled) setOffice({ id: officeId, name: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [officeId]);

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
      <PageHeader
        title="Perfil"
        watermark="Perfil"
        description="Gestiona la configuración y preferencias de tu perfil"
      />

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl">
        <form onSubmit={handleSave} className="space-y-6">
          <div>
            <label htmlFor="profile-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Nombre
            </label>
            <input
              id="profile-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Tu nombre"
              required
            />
          </div>

          <div>
            <label htmlFor="profile-email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Correo Electrónico
            </label>
            <input
              id="profile-email"
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

          {profile.role === 'consultant' && (
            <>
              <div>
                <label
                  htmlFor="profile-office"
                  className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                >
                  Promotoría
                </label>
                <input
                  id="profile-office"
                  type="text"
                  value={officeName || '—'}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                />
              </div>
              {profile.consultant_code ? (
                <div>
                  <label
                    htmlFor="profile-consultant-code"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Código de asesor
                  </label>
                  <input
                    id="profile-consultant-code"
                    type="text"
                    value={profile.consultant_code}
                    disabled
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                  />
                </div>
              ) : null}
            </>
          )}

          {message && (
            <div className={`p-4 rounded-lg ${message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
              }`}>
              <p className={`text-sm ${message.type === 'success'
                ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
                }`}>
                {message.text}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-fit"
            >
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>

            {profile.role === 'promotory' && (
              <div className="mt-6 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
                  Zona de peligro
                </h2>
                <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                  Esta acción eliminará todas las pólizas, detalles, cobranza (pagos e historial),
                  clientes y asesores asociados a esta promotoría. No se pueden deshacer estos cambios.
                </p>
                <button
                  type="button"
                  disabled={cleaning}
                  onClick={() => setShowCleanupDialog(true)}
                  className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-fit"
                >
                  Limpiar todos los datos registrados
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      <ConfirmDialog
        open={showCleanupDialog}
        title="Confirmar eliminación"
        description={`¿Estás seguro de que quieres borrar TODAS las pólizas, detalles, datos de cobranza, clientes y asesores de esta promotoría?\n\nEsta acción no se puede deshacer.`}
        confirmLabel="Confirmar eliminación"
        cancelLabel="Cancelar"
        loadingLabel="Limpiando…"
        loading={cleaning}
        onCancel={() => {
          if (!cleaning) setShowCleanupDialog(false);
        }}
        onConfirm={() => {
          void (async () => {
            if (!profile?.id) return;
            setCleaning(true);
            setMessage(null);
            try {
              const res = await authFetch('/api/office/cleanup', {
                method: 'POST',
                body: JSON.stringify({ officeId: profile.id }),
              });
              const data = await res.json();
              if (!res.ok || !data.success) {
                throw new Error(
                  data.error || 'Error al limpiar los datos de la promotoría',
                );
              }
              setShowCleanupDialog(false);
              setMessage({
                type: 'success',
                text: 'Datos de la promotoría eliminados correctamente.',
              });
            } catch (error: unknown) {
              console.error('Error cleaning office data:', error);
              setMessage({
                type: 'error',
                text:
                  error instanceof Error
                    ? error.message
                    : 'Error al limpiar los datos de la promotoría',
              });
            } finally {
              setCleaning(false);
            }
          })();
        }}
      />
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
