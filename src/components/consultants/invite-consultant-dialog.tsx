'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { FormSection } from '@/components/ui/form-section';
import { Input } from '@/components/ui/input';
import { consultantCodeSchema, emailSchema, LIMITS } from '@/lib/validation/schemas';
import { filterCode, filterEmail, filterEntityName } from '@/lib/validation/input-filters';

type InvitedConsultantInfo = {
  consultantCode: string;
  name: string;
  email: string;
};

type Props = {
  open: boolean;
  officeId: string;
  onClose: () => void;
  /** Called after the asesor is created (invited or not) so parents can select it. */
  onInvited?: (info: InvitedConsultantInfo) => void;
  /** Stack above another open dialog (registrar póliza). */
  elevated?: boolean;
};

function randomTempPassword(): string {
  const base = Math.random().toString(36).slice(2, 10);
  return `Tmp.${base}9!`;
}

/** Crear asesor: clave + nombre, correo; the invitation email goes only when "Invitar" is checked. */
export function InviteConsultantDialog({ open, officeId, onClose, onInvited, elevated = false }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState(true);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setCode('');
    setInvite(true);
    setError('');
    setFieldErrors({});
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const emailValue = email.trim().toLowerCase();
  const canSubmit = Boolean(name.trim()) && Boolean(code.trim()) && (!invite || Boolean(emailValue));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errors: Record<string, string> = {};
    if (!consultantCodeSchema.safeParse(code.trim()).success) errors.code = 'Usa solo letras, números y . _ -';
    if (emailValue && !emailSchema.safeParse(emailValue).success) errors.email = 'Revisa el correo.';
    if (invite && !emailValue) errors.email = 'Para invitarlo necesitamos su correo.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      // With correo: real account (PENDING when invited, NOT_INVITED otherwise). Without: same as import.
      const createRes = await authFetch('/api/extractor/create-consultants', {
        method: 'POST',
        body: JSON.stringify(
          emailValue
            ? {
                mode: 'manual',
                officeId,
                consultants: [
                  { consultantCode: code.trim(), name: name.trim(), email: emailValue, password: randomTempPassword(), invite },
                ],
              }
            : { mode: 'auto', officeId, consultants: [{ code: code.trim(), name: name.trim() }] },
        ),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        const message = createData.error || 'No se pudo crear al asesor.';
        if (/correo/i.test(message)) setFieldErrors({ email: message });
        else if (/clave/i.test(message)) setFieldErrors({ code: message });
        else setError(message);
        return;
      }

      if (invite) {
        const inviteRes = await authFetch('/api/invite-consultant', {
          method: 'POST',
          body: JSON.stringify({
            officeId,
            consultantEmail: emailValue,
            consultantName: name.trim(),
            consultantCode: code.trim(),
          }),
        });
        const inviteData = await inviteRes.json().catch(() => ({}));
        if (inviteRes.ok) {
          toast.success(`Asesor creado. Le enviamos la invitación a ${emailValue}.`);
        } else {
          console.warn('invite-consultant:', inviteData);
          toast.error(inviteData.error || 'El asesor quedó creado, pero no se pudo enviar la invitación.');
        }
      } else {
        toast.success('Asesor creado. Podrás invitarlo cuando quieras desde su expediente.');
      }

      onInvited?.({ consultantCode: code.trim(), name: name.trim(), email: emailValue });
      reset();
      onClose();
    } catch (err) {
      console.error(err);
      setError('No se pudo crear al asesor. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title="Crear asesor"
      description="Regístralo para asignarle pólizas. Puedes invitarlo ahora o después."
      onClose={handleClose}
      busy={submitting}
      size="lg"
      elevated={elevated}
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="create-consultant-form" variant="brand" size="lg" disabled={submitting || !canSubmit}>
            {submitting ? 'Guardando…' : invite ? 'Crear e invitar' : 'Crear asesor'}
          </Button>
        </>
      }
    >
      <form id="create-consultant-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection title="Datos del asesor">
          <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
            <FormField
              label="Clave"
              htmlFor="invite-consultant-code"
              variant="auth"
              error={fieldErrors.code}
            >
              <Input
                id="invite-consultant-code"
                value={code}
                onChange={(e) => setCode(filterCode(e.target.value).replace(/\//g, ''))}
                maxLength={LIMITS.consultantCode}
                autoCapitalize="characters"
                spellCheck={false}
                autoFocus
                placeholder="Ej. A-104827"
                className="font-mono"
              />
            </FormField>
            <FormField label="Nombre" htmlFor="invite-consultant-name" variant="auth">
              <Input
                id="invite-consultant-name"
                value={name}
                onChange={(e) => setName(filterEntityName(e.target.value))}
                maxLength={LIMITS.personName}
                autoCapitalize="words"
                placeholder="Nombre y apellidos"
                autoComplete="off"
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Acceso a LifeOps">
          <FormField
            label="Correo"
            htmlFor="invite-consultant-email"
            variant="auth"
            hint={invite ? 'Aquí le llega la invitación.' : 'Opcional. Lo necesitarás para invitarlo después.'}
            error={fieldErrors.email}
          >
            <Input
              id="invite-consultant-email"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(filterEmail(e.target.value))}
              maxLength={LIMITS.email}
              placeholder="correo@ejemplo.com"
              autoComplete="off"
            />
          </FormField>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-(--lifeops-field-border) bg-(--lifeops-field) px-3 py-3 text-sm">
            <input
              type="checkbox"
              checked={invite}
              onChange={(e) => setInvite(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#FBDBAC]"
            />
            <span>
              <span className="block font-medium text-(--lifeops-fg)">Enviar invitación por correo</span>
              <span className="block text-xs text-(--lifeops-muted)">
                Recibe un enlace para crear su contraseña y ver su cartera en LifeOps.
              </span>
            </span>
          </label>
        </FormSection>

        {error ? (
          <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-(--lifeops-fg)">
            {error}
          </p>
        ) : null}
      </form>
    </AppDialog>
  );
}
