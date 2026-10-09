'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/api-client';
import type { Consultant } from '@/lib/supabase';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  consultantDisplayNameSchema,
  emailSchema,
  LIMITS,
} from '@/lib/validation/schemas';

type Props = {
  open: boolean;
  consultant: Consultant;
  officeId: string;
  onClose: () => void;
  onSaved: (next: Pick<Consultant, 'name' | 'email'>) => void;
};

export function EditConsultantDialog({
  open,
  consultant,
  officeId,
  onClose,
  onSaved,
}: Props) {
  const [name, setName] = useState(consultant.name);
  const [email, setEmail] = useState(consultant.email ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formKey = open
    ? `${consultant.id}\0${consultant.name}\0${consultant.email ?? ''}`
    : 'closed';
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    if (open) {
      setName(consultant.name);
      setEmail(consultant.email ?? '');
      setFieldErrors({});
      setError('');
    }
  }

  const close = () => {
    if (saving) return;
    onClose();
  };

  const save = async () => {
    const nextErrors: Record<string, string> = {};
    const nameParsed = consultantDisplayNameSchema.safeParse(name);
    if (!nameParsed.success) nextErrors.name = 'Ingresa un nombre válido.';
    const emailTrim = email.trim();
    const emailParsed = emailTrim ? emailSchema.safeParse(emailTrim) : null;
    if (emailTrim && !emailParsed?.success) {
      nextErrors.email = 'Ingresa un correo válido.';
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
          },
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const fieldMsg = data.fieldErrors?.name || data.fieldErrors?.email;
        throw new Error(fieldMsg || data.error || 'No se pudo guardar el asesor.');
      }
      onSaved({
        name: nameParsed.success ? nameParsed.data : name.trim(),
        email: emailParsed?.success ? emailParsed.data : null,
      });
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
      description="Cambia el nombre o el correo. El código y el estado se quedan igual."
      onClose={close}
      busy={saving}
      size="md"
    >
      <div className="space-y-4">
        <FormField label="Nombre" htmlFor="edit-consultant-name" variant="auth" error={fieldErrors.name}>
          <Input
            id="edit-consultant-name"
            value={name}
            maxLength={LIMITS.personName}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
          />
        </FormField>
        <FormField
          label="Correo"
          htmlFor="edit-consultant-email"
          variant="auth"
          hint="Opcional. Hace falta para invitar."
          error={fieldErrors.email}
        >
          <Input
            id="edit-consultant-email"
            type="email"
            value={email}
            maxLength={LIMITS.email}
            placeholder="correo@ejemplo.com"
            disabled={saving}
            onChange={(e) => setEmail(e.target.value)}
          />
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={saving || !name.trim()}
            onClick={() => void save()}
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
