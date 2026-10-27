'use client';

import { useState } from 'react';
import type { Client } from '@/lib/supabase';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PhoneInput } from '@/components/ui/phone-input';
import { DateInput } from '@/components/ui/date-input';
import { FormSection } from '@/components/ui/form-section';
import {
  LIMITS,
  clientContactSchema,
  optionalCurpSchema,
  optionalRfcSchema,
  personNameSchema,
} from '@/lib/validation/schemas';
import { filterEmail, filterPersonName, filterTaxId } from '@/lib/validation/input-filters';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type ClientFormSubmitData = {
  name: string;
  date_of_birth: string;
  curp: string | null;
  rfc: string | null;
  phone: string | null;
  email: string | null;
};

type Props = {
  open: boolean;
  editingClient: Client | null;
  onClose: () => void;
  /** Return `{ error, fieldErrors }` to show server validation under each field */
  onSubmit: (data: ClientFormSubmitData) => Promise<void | { error: string; fieldErrors?: Record<string, string> }>;
};

export function ClientFormDialog({
  open,
  editingClient,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [curp, setCurp] = useState('');
  const [rfc, setRfc] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const maxDate = todayIsoDate();
  const formKey = open
    ? `${editingClient?.id ?? 'new'}\0${editingClient?.name ?? ''}\0${editingClient?.birth_date ?? ''}\0${editingClient?.curp ?? ''}\0${editingClient?.rfc ?? ''}\0${editingClient?.phone ?? ''}\0${editingClient?.email ?? ''}`
    : 'closed';
  const [seenFormKey, setSeenFormKey] = useState(formKey);
  if (seenFormKey !== formKey) {
    setSeenFormKey(formKey);
    if (open) {
      setName(editingClient?.name ?? '');
      setBirthDate(editingClient?.birth_date ?? '');
      setCurp(editingClient?.curp ?? '');
      setRfc(editingClient?.rfc ?? '');
      setPhone(editingClient?.phone ?? '');
      setEmail(editingClient?.email ?? '');
      setFieldErrors({});
      setError('');
    }
  }

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});

    const nameParsed = personNameSchema.safeParse(name);
    if (!nameParsed.success) {
      setFieldErrors({ name: 'Ingresa un nombre válido.' });
      return;
    }
    if (birthDate && birthDate > maxDate) {
      setFieldErrors({ birthDate: 'La fecha de nacimiento no puede ser futura.' });
      return;
    }

    const curpParsed = optionalCurpSchema.safeParse(curp);
    if (!curpParsed.success) {
      setFieldErrors({ curp: 'CURP inválida (18 caracteres).' });
      return;
    }
    const rfcParsed = optionalRfcSchema.safeParse(rfc);
    if (!rfcParsed.success) {
      setFieldErrors({ rfc: 'RFC inválido (12 o 13 caracteres).' });
      return;
    }

    const contactParsed = clientContactSchema.safeParse({ phone, email });
    if (!contactParsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of contactParsed.error.issues) {
        if (issue.path[0] === 'phone') errors.phone = 'Escribe los 10 dígitos del teléfono.';
        if (issue.path[0] === 'email') errors.email = 'Revisa el correo.';
      }
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    try {
      const failure = await onSubmit({
        name: nameParsed.data,
        date_of_birth: birthDate,
        curp: curpParsed.data,
        rfc: rfcParsed.data,
        phone: contactParsed.data.phone ?? null,
        email: contactParsed.data.email ?? null,
      });
      if (failure) {
        setFieldErrors(failure.fieldErrors ?? {});
        setError(failure.error);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo guardar el cliente. Intenta de nuevo.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title={editingClient ? 'Editar cliente' : 'Nuevo cliente'}
      description={
        editingClient
          ? 'Los cambios quedan en su historial.'
          : 'Regístralo para asociarlo a pólizas. CURP o RFC ayudan a evitar duplicados.'
      }
      onClose={handleClose}
      busy={submitting}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={handleClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="submit" form="client-form" variant="brand" size="lg" disabled={submitting || !name.trim()}>
            {submitting ? 'Guardando…' : editingClient ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <form id="client-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
        <FormSection title="Datos personales">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            <FormField label="Nombre completo" htmlFor="client-form-name" variant="auth" error={fieldErrors.name}>
              <Input
                id="client-form-name"
                value={name}
                onChange={(e) => setName(filterPersonName(e.target.value))}
                autoCapitalize="words"
                maxLength={LIMITS.personName}
                required
                autoFocus
                placeholder="Nombre y apellidos"
              />
            </FormField>
            <FormField label="Nacimiento" htmlFor="client-form-birth" variant="auth" hint="Opcional" error={fieldErrors.birthDate}>
              <DateInput id="client-form-birth" value={birthDate} max={maxDate} onChange={setBirthDate} />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Contacto" description="Para recordarle sus pagos por WhatsApp o correo.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Teléfono o WhatsApp" htmlFor="client-form-phone" variant="auth" hint="Opcional" error={fieldErrors.phone}>
              <PhoneInput id="client-form-phone" value={phone} onChange={setPhone} />
            </FormField>
            <FormField label="Correo" htmlFor="client-form-email" variant="auth" hint="Opcional" error={fieldErrors.email}>
              <Input
                id="client-form-email"
                type="email"
                inputMode="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(filterEmail(e.target.value))}
                maxLength={LIMITS.email}
                placeholder="cliente@correo.com"
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Identificación" description="Opcional. Evita registrar al mismo cliente dos veces.">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="CURP" htmlFor="client-form-curp" variant="auth" hint="18 caracteres" error={fieldErrors.curp}>
              <Input
                id="client-form-curp"
                value={curp}
                onChange={(e) => setCurp(filterTaxId(e.target.value))}
                maxLength={18}
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono uppercase"
              />
            </FormField>
            <FormField label="RFC" htmlFor="client-form-rfc" variant="auth" hint="12 o 13 caracteres" error={fieldErrors.rfc}>
              <Input
                id="client-form-rfc"
                value={rfc}
                onChange={(e) => setRfc(filterTaxId(e.target.value))}
                maxLength={13}
                autoCapitalize="characters"
                spellCheck={false}
                className="font-mono uppercase"
              />
            </FormField>
          </div>
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
