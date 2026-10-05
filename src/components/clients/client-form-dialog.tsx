'use client';

import { useEffect, useState } from 'react';
import type { Client } from '@/lib/supabase';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { LIMITS } from '@/lib/validation/schemas';

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

type Props = {
  open: boolean;
  editingClient: Client | null;
  onClose: () => void;
  onSubmit: (data: { name: string; date_of_birth: string }) => Promise<void>;
};

export function ClientFormDialog({
  open,
  editingClient,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const maxDate = todayIsoDate();

  useEffect(() => {
    if (!open) return;
    setName(editingClient?.name ?? '');
    setBirthDate(editingClient?.birth_date ?? '');
    setError('');
  }, [open, editingClient]);

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (birthDate && birthDate > maxDate) {
      setError('La fecha de nacimiento no puede ser futura.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ name: name.trim(), date_of_birth: birthDate });
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
          : 'Registra un cliente para asociarlo a pólizas.'
      }
      onClose={handleClose}
      busy={submitting}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Nombre completo" htmlFor="client-form-name" variant="auth">
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
