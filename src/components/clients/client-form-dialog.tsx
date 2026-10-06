'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/supabase';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  LIMITS,
  optionalCurpSchema,
  optionalRfcSchema,
  personNameSchema,
} from '@/lib/validation/schemas';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type ClientFormSubmitData = {
  name: string;
  date_of_birth: string;
  curp: string | null;
  rfc: string | null;
};

type Props = {
  open: boolean;
  editingClient: Client | null;
  onClose: () => void;
  onSubmit: (data: ClientFormSubmitData) => Promise<void>;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const maxDate = todayIsoDate();

  useEffect(() => {
    if (!open) return;
    setName(editingClient?.name ?? '');
    setBirthDate(editingClient?.birth_date ?? '');
    setCurp(editingClient?.curp ?? '');
    setRfc(editingClient?.rfc ?? '');
    setFieldErrors({});
    setError('');
  }, [open, editingClient]);

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

    setSubmitting(true);
    try {
      await onSubmit({
        name: nameParsed.data,
        date_of_birth: birthDate,
        curp: curpParsed.data,
        rfc: rfcParsed.data,
      });
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
          ? 'Actualiza los datos del cliente.'
          : 'Registra un cliente para asociarlo a pólizas. CURP/RFC ayudan a evitar duplicados.'
      }
      onClose={handleClose}
      busy={submitting}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField
          label="Nombre completo"
          htmlFor="client-form-name"
          variant="auth"
          error={fieldErrors.name}
        >
          <Input
            id="client-form-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={LIMITS.personName}
            required
            placeholder="Nombre del cliente"
          />
        </FormField>
        <FormField
          label="Fecha de nacimiento"
          htmlFor="client-form-birth"
          variant="auth"
          hint="Opcional"
          error={fieldErrors.birthDate}
        >
          <Input
            id="client-form-birth"
            type="date"
            value={birthDate}
            max={maxDate}
            onChange={(e) => {
              const next = e.target.value;
              if (next && next > maxDate) return;
              setBirthDate(next);
            }}
            className="w-full"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="CURP"
            htmlFor="client-form-curp"
            variant="auth"
            hint="Opcional · 18 caracteres"
            error={fieldErrors.curp}
          >
            <Input
              id="client-form-curp"
              value={curp}
              onChange={(e) => setCurp(e.target.value.toUpperCase())}
              maxLength={18}
              autoCapitalize="characters"
              placeholder="XXXX000000XXXXXX00"
              className="uppercase"
            />
          </FormField>
          <FormField
            label="RFC"
            htmlFor="client-form-rfc"
            variant="auth"
            hint="Opcional · 12 o 13 caracteres"
            error={fieldErrors.rfc}
          >
            <Input
              id="client-form-rfc"
              value={rfc}
              onChange={(e) => setRfc(e.target.value.toUpperCase())}
              maxLength={13}
              autoCapitalize="characters"
              placeholder="XXXX000000XXX"
              className="uppercase"
            />
          </FormField>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-200"
          >
            {error}
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
            type="submit"
            variant="brand"
            size="lg"
            disabled={submitting || !name.trim()}
          >
            {submitting
              ? 'Guardando…'
              : editingClient
                ? 'Actualizar'
                : 'Crear cliente'}
          </Button>
        </div>
      </form>
    </AppDialog>
  );
}
