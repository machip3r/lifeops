'use client';

import { useState } from 'react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { LIMITS } from '@/lib/validation/schemas';

export type InvitedConsultantInfo = {
  consultantCode: string;
  name: string;
  email: string;
};

type Props = {
  open: boolean;
  officeId: string;
  onClose: () => void;
  /** Called after invite (+ account create) succeeds so parents can select the asesor. */
  onInvited?: (info: InvitedConsultantInfo) => void;
  /** Stack above another open dialog (registrar póliza). */
  elevated?: boolean;
};

function randomTempPassword(): string {
  const base = Math.random().toString(36).slice(2, 10);
  return `Tmp.${base}9!`;
}

export function InviteConsultantDialog({
  open,
  officeId,
  onClose,
  onInvited,
  elevated = false,
}: Props) {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName('');
    setEmail('');
    setCode('');
    setError('');
    setSuccess('');
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    setSuccess('');
    if (!name.trim() || !email.trim() || !code.trim()) {
      setError('Completa nombre, correo y código del asesor.');
      return;
    }

    setSubmitting(true);
    try {
      // Create Auth + consultant so the asesor can be selected immediately.
      const createRes = await authFetch('/api/extractor/create-consultants', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'manual',
          officeId,
          consultants: [
            {
              consultantCode: code.trim(),
              name: name.trim(),
              email: email.trim().toLowerCase(),
              password: randomTempPassword(),
            },
          ],
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(createData.error || 'No se pudo registrar al asesor.');
      }

      const inviteRes = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId,
          consultantEmail: email.trim().toLowerCase(),
          consultantName: name.trim(),
          consultantCode: code.trim(),
        }),
      });
      const inviteData = await inviteRes.json().catch(() => ({}));
      if (!inviteRes.ok) {
        // Account exists; still allow selection even if correo failed.
        console.warn('invite-consultant:', inviteData);
        toast.error(
          inviteData.error ||
            'El asesor quedó registrado, pero no se pudo enviar el correo.',
        );
      } else {
        setSuccess(
          `Invitación enviada a ${email.trim().toLowerCase()}. Ya puedes seleccionarlo.`,
        );
        toast.success('Asesor invitado.');
      }

      const info: InvitedConsultantInfo = {
        consultantCode: code.trim(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
      };
      onInvited?.(info);

      setTimeout(() => {
        reset();
        onClose();
      }, inviteRes.ok ? 1200 : 0);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error ? e.message : 'No se pudo invitar al asesor.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(name.trim()) && Boolean(email.trim()) && Boolean(code.trim());

  return (
    <AppDialog
      open={open}
      title="Invitar asesor"
      description="Se crea la cuenta y se envía el correo con el enlace de acceso."
      onClose={handleClose}
      busy={submitting}
      size="lg"
      elevated={elevated}
    >
      <div className="space-y-4">
        <FormField label="Nombre del asesor" htmlFor="invite-consultant-name" variant="auth">
          <Input
            id="invite-consultant-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.personName}
           
            placeholder="Nombre completo"
            autoComplete="name"
          />
        </FormField>
        <FormField label="Correo" htmlFor="invite-consultant-email" variant="auth">
          <Input
            id="invite-consultant-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={LIMITS.email}
           
            placeholder="correo@ejemplo.com"
            autoComplete="email"
          />
        </FormField>
        <FormField label="Código del asesor" htmlFor="invite-consultant-code" variant="auth">
          <Input
            id="invite-consultant-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={LIMITS.consultantCode}
           
            placeholder="Clave única del asesor"
          />
        </FormField>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}
        {success && (
          <div
            role="status"
            className="rounded-lg border border-green-800 bg-green-900/20 p-3 text-sm text-green-200"
          >
            {success}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={handleClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={submitting || !canSubmit}
            onClick={() => void handleSubmit()}
          >
            {submitting ? 'Enviando…' : 'Enviar invitación'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
