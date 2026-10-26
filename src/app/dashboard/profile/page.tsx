'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/dashboard/page-header';
import { DetailCard } from '@/components/dashboard/detail-card';
import { OfficeSettings } from '@/components/onboarding/office-settings';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { LIMITS } from '@/lib/validation/schemas';

function ProfilePageContent() {
  const { profile, loading: authLoading, reloadProfile } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
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

  /** Asesor display name (promotoría data is edited in OfficeSettings). */
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile?.role !== 'consultant') return;

    setSaving(true);
    try {
      // getConsultantById searches by both id and auth_user_id
      const consultant = await db.consultant.getConsultantById(profile.id);
      if (!consultant) throw new Error('No encontramos tu perfil de asesor.');
      await db.consultant.updateConsultant(consultant.id, { name: name.trim() });
      await reloadProfile();
      toast.success('Nombre actualizado.');
    } catch (error: unknown) {
      console.error('Error updating profile:', error);
      toast.error('No se pudo actualizar tu nombre. Intenta de nuevo.');
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
        description={profile.role === 'promotory' ? 'Datos de tu promotoría y de tu cuenta' : 'Tus datos como asesor'}
      />

      {profile.role === 'promotory' ? (
        <div className="max-w-3xl">
          <OfficeSettings officeId={profile.id} />

          <DetailCard title="Cuenta">
            <FormField
              label="Correo electrónico"
              htmlFor="profile-email"
              variant="auth"
              hint="El correo de la cuenta no se puede modificar."
            >
              <Input id="profile-email" type="email" value={email} disabled />
            </FormField>
          </DetailCard>

          <DetailCard title="Zona de peligro">
            <p className="mb-4 text-sm text-(--lifeops-muted)">
              Esta acción eliminará todas las pólizas, detalles, cobranza (pagos e historial),
              clientes y asesores asociados a esta promotoría. No se puede deshacer.
            </p>
            <Button
              type="button"
              variant="destructive"
              disabled={cleaning}
              onClick={() => setShowCleanupDialog(true)}
            >
              Limpiar todos los datos registrados
            </Button>
          </DetailCard>
        </div>
      ) : (
        <form onSubmit={handleSave} className="max-w-2xl">
          <DetailCard title="Tus datos">
            <div className="flex flex-col gap-5">
              <FormField label="Nombre" htmlFor="profile-name" variant="auth">
                <Input
                  id="profile-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={LIMITS.personName}
                  autoCapitalize="words"
                  required
                />
              </FormField>
              <FormField
                label="Correo electrónico"
                htmlFor="profile-email"
                variant="auth"
                hint="El correo de la cuenta no se puede modificar."
              >
                <Input id="profile-email" type="email" value={email} disabled />
              </FormField>
              <FormField label="Promotoría" htmlFor="profile-office" variant="auth">
                <Input id="profile-office" value={officeName || '—'} disabled />
              </FormField>
              {profile.consultant_code ? (
                <FormField label="Código de asesor" htmlFor="profile-consultant-code" variant="auth">
                  <Input id="profile-consultant-code" value={profile.consultant_code} disabled />
                </FormField>
              ) : null}
            </div>
            <div className="mt-6 flex justify-end">
              <Button type="submit" variant="brand" disabled={saving || !name.trim()}>
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </Button>
            </div>
          </DetailCard>
        </form>
      )}

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
              toast.success('Datos de la promotoría eliminados correctamente.');
            } catch (error: unknown) {
              console.error('Error cleaning office data:', error);
              toast.error(
                error instanceof Error
                  ? error.message
                  : 'Error al limpiar los datos de la promotoría',
              );
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
