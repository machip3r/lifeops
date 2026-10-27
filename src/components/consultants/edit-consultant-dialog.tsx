'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast';
import type { Consultant } from '@/lib/supabase';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FormSection } from '@/components/ui/form-section';
import {
  consultantCodeSchema,
  consultantDisplayNameSchema,
  emailSchema,
  LIMITS,
} from '@/lib/validation/schemas';
import { filterCode, filterEmail, filterEntityName } from '@/lib/validation/input-filters';

type Props = {
  open: boolean;
  consultant: Consultant;
  officeId: string;
  onClose: () => void;
  onSaved: (next: Pick<Consultant, 'name' | 'email' | 'consultant_code'> & { status?: Consultant['status'] }) => void;
};

export function EditConsultantDialog({
  open,
  consultant,
  officeId,
  onClose,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(consultant.name);
  const [email, setEmail] = useState(consultant.email ?? '');
  const [code, setCode] = useState(consultant.consultant_code ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formKey = open
    ? `${consultant.id}\0${consultant.name}\0${consultant.email ?? ''}\0${consultant.consultant_code ?? ''}`
    : 'closed';
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    if (open) {
      setName(consultant.name);
      setEmail(consultant.email ?? '');
      setCode(consultant.consultant_code ?? '');
      setFieldErrors({});
      setError('');
    }
  }

  const close = () => {
    if (saving) return;
    onClose();
  };

  // A new correo for someone without access yet: save and send the invitation in one step
  const emailChanged = email.trim().toLowerCase() !== (consultant.email ?? '').trim().toLowerCase();
  const inviteOnSave = emailChanged && Boolean(email.trim()) && consultant.status !== 'ACTIVE' && consultant.status !== 'INACTIVE';

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const nameParsed = consultantDisplayNameSchema.safeParse(name);
    if (!nameParsed.success) nextErrors.name = 'Ingresa un nombre válido.';
    const emailTrim = email.trim();
    const emailParsed = emailTrim ? emailSchema.safeParse(emailTrim) : null;
    if (emailTrim && !emailParsed?.success) {
      nextErrors.email = 'Ingresa un correo válido.';
    }
    const codeTrim = code.trim();
    const codeParsed = codeTrim ? consultantCodeSchema.safeParse(codeTrim) : null;
    if (codeTrim && !codeParsed?.success) {
      nextErrors.consultant_code = 'Usa solo letras, números y . _ -';
    }
    setFieldErrors(nextErrors);
    setError('');
    if (Object.keys(nextErrors).length > 0) return;

    setSaving(true);
    try {
      const response = await authFetch('/api/consultants/update', {
        method: 'POST',
        body: JSON.stringify({
          consultantId: consultant.id,
          officeId,
          updates: {
            name: nameParsed.success ? nameParsed.data : name.trim(),
            email: emailParsed?.success ? emailParsed.data : null,
            // An empty clave keeps the current one (imports match by clave)
            consultant_code: codeParsed?.success ? codeParsed.data : undefined,
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error || 'No se pudo guardar el asesor.');
      }
      const saved = {
        name: nameParsed.success ? nameParsed.data : name.trim(),
        email: emailParsed?.success ? emailParsed.data : null,
        consultant_code: codeParsed?.success ? codeParsed.data : consultant.consultant_code,
      };

      if (inviteOnSave && saved.email) {
        const inviteRes = await authFetch('/api/invite-consultant', {
          method: 'POST',
          body: JSON.stringify({
            officeId,
            consultantId: consultant.id,
            consultantEmail: saved.email,
            consultantName: saved.name,
            consultantCode: (saved.consultant_code || '').trim(),
          }),
        });
        const inviteData = await inviteRes.json().catch(() => ({}));
        if (inviteRes.ok) {
          toast.success(`Guardado. Le enviamos la invitación a ${saved.email}.`);
          onSaved({ ...saved, status: 'PENDING' });
        } else {
          toast.error(inviteData.error || 'Se guardó, pero no se pudo enviar la invitación.');
          onSaved(saved);
        }
      } else {
        onSaved(saved);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el asesor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title="Editar asesor"
      description="Los cambios quedan en su historial."
      onClose={close}
      busy={saving}
      size="md"
      footer={
        <>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-consultant-form" variant="brand" size="lg" disabled={saving || !name.trim()}>
            {saving ? 'Guardando…' : inviteOnSave ? 'Guardar e invitar' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      <form
        id="edit-consultant-form"
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <FormSection title="Datos del asesor">
          <FormField label="Nombre" htmlFor="edit-consultant-name" variant="auth" error={fieldErrors.name}>
            <Input
              id="edit-consultant-name"
              value={name}
              maxLength={LIMITS.personName}
              disabled={saving}
              autoCapitalize="words"
              autoFocus
              onChange={(e) => setName(filterEntityName(e.target.value))}
            />
          </FormField>
          <FormField
            label="Clave de asesor"
            htmlFor="edit-consultant-code"
            variant="auth"
            hint="La de los archivos de comisiones (columna ASESOR)."
            error={fieldErrors.consultant_code}
          >
            <Input
              id="edit-consultant-code"
              value={code}
              maxLength={LIMITS.consultantCode}
              autoCapitalize="characters"
              spellCheck={false}
              disabled={saving}
              className="font-mono"
              onChange={(e) => setCode(filterCode(e.target.value).replace(/\//g, ''))}
            />
          </FormField>
        </FormSection>

        <FormSection title="Acceso a LifeOps" description="Con este correo entra y recibe su invitación.">
          <FormField
            label="Correo"
            htmlFor="edit-consultant-email"
            variant="auth"
            hint={
              inviteOnSave
                ? 'Al guardar le enviaremos la invitación a este correo.'
                : 'Si lo cambias, también cambia el de su acceso.'
            }
            error={fieldErrors.email}
          >
            <Input
              id="edit-consultant-email"
              type="email"
              inputMode="email"
              value={email}
              maxLength={LIMITS.email}
              placeholder="correo@ejemplo.com"
              disabled={saving}
              onChange={(e) => setEmail(filterEmail(e.target.value))}
            />
          </FormField>
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
