'use client';

import { useState, useEffect } from 'react';
import { Link2, TriangleAlert } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import ProtectedRoute from '@/components/protected-route';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { PageHeader } from '@/components/dashboard/page-header';
import { DetailCard, DetailRow, DetailRows } from '@/components/dashboard/detail-card';
import { EditButton, ProfileAvatar } from '@/components/dashboard/profile-parts';
import { OfficeSettings } from '@/components/onboarding/office-settings';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { DotBadge } from '@/components/ui/dot-badge';
import { PageSkeleton } from '@/components/ui/skeleton';
import { canCreatePromotoryRegistrationLinkAction, createPromotoryRegistrationLinkAction, updateOwnNameAction } from '@/app/dashboard/profile/actions';
import { filterEntityName } from '@/lib/validation/input-filters';
import { LIMITS } from '@/lib/validation/schemas';

/** Destructive office reset, kept apart at the bottom of the promotoría column. */
function DangerZone({ onClean, cleaning }: { onClean: () => void; cleaning: boolean }) {
  return (
    <section className="rounded-xl border border-red-500/30 bg-(--lifeops-chrome) p-5">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-(--lifeops-fg)">
        <TriangleAlert className="h-4 w-4 text-red-500" aria-hidden />
        Zona de peligro
      </h2>
      <p className="mt-2 text-[13px] text-(--lifeops-muted)">
        Borra todas las pólizas, recibos, cobranza (pagos e historial), clientes y asesores de tu promotoría. No se puede
        deshacer.
      </p>
      <Button type="button" variant="destructive" className="mt-4 w-full" disabled={cleaning} onClick={onClean}>
        Borrar todos los datos
      </Button>
    </section>
  );
}

/** Asesor: identity + its data; only the display name is editable. */
function ConsultantProfile() {
  const { profile, session, reloadProfile } = useAuth();
  const { toast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [saving, setSaving] = useState(false);
  const officeId = profile?.office_id ?? '';
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

  if (!profile) return null;

  const openEdit = () => {
    setName(profile.name ?? '');
    setNameError('');
    setEditOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.access_token) {
      toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
      return;
    }
    setSaving(true);
    setNameError('');
    try {
      const result = await updateOwnNameAction(session.access_token, { name });
      if (!result.ok) {
        setNameError(('fieldErrors' in result && result.fieldErrors?.name) || result.error);
        return;
      }
      await reloadProfile();
      toast.success('Nombre actualizado.');
      setEditOpen(false);
    } catch (error) {
      console.error('updateOwnNameAction:', error);
      toast.error('No se pudo guardar tu nombre. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar name={profile.name} />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-(--lifeops-fg)">{profile.name || 'Asesor'}</p>
            <p className="truncate text-sm text-(--lifeops-muted)">Asesor{officeName ? ` · ${officeName}` : ''}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <DotBadge label="Acceso activo" color="var(--viz-current)" />
          {profile.consultant_code ? (
            <span className="rounded-full border border-(--lifeops-border) px-2 py-0.5 font-mono text-xs text-(--lifeops-fg)">
              {profile.consultant_code}
            </span>
          ) : null}
        </div>
        <p className="mt-5 border-t border-(--lifeops-border) pt-4 text-xs text-(--lifeops-muted)">
          Tu correo y tu clave los administra tu promotoría. Si necesitas cambiarlos, pídeselo.
        </p>
      </section>

      <DetailCard
        className="mb-0 lg:col-span-2"
        title="Tus datos"
        actions={<EditButton label="Editar tu nombre" onClick={openEdit} />}
      >
        <DetailRows>
          <DetailRow label="Nombre">{profile.name || '—'}</DetailRow>
          <DetailRow label="Correo">
            <span className="break-all">{profile.email || '—'}</span>
          </DetailRow>
          <DetailRow label="Promotoría">{officeName || '—'}</DetailRow>
          <DetailRow label="Clave de asesor">
            {profile.consultant_code ? <span className="font-mono">{profile.consultant_code}</span> : '—'}
          </DetailRow>
        </DetailRows>
      </DetailCard>

      <AppDialog
        open={editOpen}
        title="Tu nombre"
        description="Así te verán tu promotoría y tus reportes."
        onClose={() => (saving ? undefined : setEditOpen(false))}
        busy={saving}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" size="lg" disabled={saving} onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="profile-name-form" variant="brand" size="lg" disabled={saving || !name.trim()}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </>
        }
      >
        <form id="profile-name-form" onSubmit={save} noValidate>
          <FormField label="Nombre" htmlFor="profile-name" variant="auth" error={nameError}>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(filterEntityName(e.target.value))}
              maxLength={LIMITS.personName}
              autoCapitalize="words"
              autoFocus
              disabled={saving}
            />
          </FormField>
        </form>
      </AppDialog>
    </div>
  );
}

function ProfilePageContent() {
  const { profile, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [cleaning, setCleaning] = useState(false);
  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [canCreateInvite, setCanCreateInvite] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState('');

  useEffect(() => {
    let cancelled = false;
    const access = session?.access_token && profile?.role === 'promotory'
      ? canCreatePromotoryRegistrationLinkAction(session.access_token)
      : Promise.resolve(false);
    void access.then((allowed) => {
      if (!cancelled) setCanCreateInvite(allowed);
    }).catch(() => {
      if (!cancelled) setCanCreateInvite(false);
    });
    return () => { cancelled = true; };
  }, [profile?.role, session?.access_token]);

  if (authLoading) return <PageSkeleton />;

  if (!profile) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-(--lifeops-muted)">No se pudo cargar el perfil.</p>
      </div>
    );
  }

  const cleanup = async () => {
    setCleaning(true);
    try {
      const res = await authFetch('/api/office/cleanup', {
        method: 'POST',
        body: JSON.stringify({ officeId: profile.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'No se pudieron borrar los datos de la promotoría.');
      }
      setShowCleanupDialog(false);
      toast.success('Se borraron los datos de la promotoría.');
    } catch (error: unknown) {
      console.error('Error cleaning office data:', error);
      toast.error(error instanceof Error ? error.message : 'No se pudieron borrar los datos de la promotoría.');
    } finally {
      setCleaning(false);
    }
  };

  const createInvite = async () => {
    if (!session?.access_token) {
      toast.error('Tu sesión expiró. Inicia sesión de nuevo.');
      return;
    }
    setCreatingInvite(true);
    try {
      const result = await createPromotoryRegistrationLinkAction(session.access_token);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setGeneratedInviteLink(result.link);
      try {
        await navigator.clipboard.writeText(result.link);
        toast.success('Enlace creado y copiado. Vence en 7 días.');
      } catch {
        toast.success('Enlace creado. Cópialo desde el campo de abajo.');
      }
    } catch (error) {
      console.error('createPromotoryRegistrationLinkAction:', error);
      toast.error('No se pudo crear o copiar el enlace.');
    } finally {
      setCreatingInvite(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Perfil"
        watermark="Perfil"
        description={
          profile.role === 'promotory'
            ? 'Los datos de tu promotoría y de tu cuenta. Edita cada sección cuando lo necesites.'
            : 'Tus datos como asesor.'
        }
      />

      {profile.role === 'promotory' ? (
        <OfficeSettings
          officeId={profile.id}
          aside={
            <div className="space-y-4">
              {canCreateInvite ? (
                <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5">
                  <h2 className="flex items-center gap-2 text-[15px] font-semibold text-(--lifeops-fg)">
                    <Link2 className="h-4 w-4 text-(--lifeops-accent)" aria-hidden />
                    Invitar promotoría
                  </h2>
                  <p className="mt-2 text-[13px] text-(--lifeops-muted)">
                    Crea un enlace para registrar una nueva promotoría. Cada enlace vence en 7 días y se puede usar una sola vez.
                  </p>
                  <Button type="button" variant="brand" className="mt-4 w-full" disabled={creatingInvite} onClick={() => void createInvite()}>
                    {creatingInvite ? 'Creando enlace…' : 'Crear enlace de registro'}
                  </Button>
                  {generatedInviteLink ? (
                    <FormField label="Enlace de registro" htmlFor="promotory-registration-link" className="mt-4">
                      <Input id="promotory-registration-link" value={generatedInviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />
                    </FormField>
                  ) : null}
                </section>
              ) : null}
              <DangerZone cleaning={cleaning} onClean={() => setShowCleanupDialog(true)} />
            </div>
          }
        />
      ) : (
        <ConsultantProfile />
      )}

      <ConfirmDialog
        open={showCleanupDialog}
        title="¿Borrar todos los datos?"
        description={`Se borrarán TODAS las pólizas, recibos, datos de cobranza, clientes y asesores de tu promotoría.\n\nEsta acción no se puede deshacer.`}
        confirmLabel="Sí, borrar todo"
        cancelLabel="Cancelar"
        loadingLabel="Borrando…"
        loading={cleaning}
        onCancel={() => {
          if (!cleaning) setShowCleanupDialog(false);
        }}
        onConfirm={() => void cleanup()}
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
