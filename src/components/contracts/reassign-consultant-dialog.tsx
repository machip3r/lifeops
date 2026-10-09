'use client';

import { useEffect, useState } from 'react';
import { authFetch } from '@/lib/api-client';
import { db } from '@/lib/db';
import type { Consultant } from '@/lib/supabase';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';

type Props = {
  officeId: string;
  contractId: string;
  currentConsultantId: string;
  onReassigned: () => void;
};

const selectClass =
  'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

export function ReassignConsultantDialog({
  officeId,
  contractId,
  currentConsultantId,
  onReassigned,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [toConsultantId, setToConsultantId] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loadingList, setLoadingList] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      try {
        const list = await db.consultant.getConsultantsByOffice(officeId);
        if (cancelled) return;
        setConsultants(
          list.filter(
            (c) =>
              c.id !== currentConsultantId &&
              c.status !== 'INACTIVE',
          ),
        );
      } catch (e) {
        console.error(e);
        toast.error('No se pudieron cargar los asesores.');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, officeId, currentConsultantId, toast]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setToConsultantId('');
    setNotes('');
    setFieldErrors({});
  };

  const handleSubmit = async () => {
    setFieldErrors({});
    if (!toConsultantId) {
      setFieldErrors({ toConsultantId: 'Selecciona un asesor.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/contracts/reassign', {
        method: 'POST',
        body: JSON.stringify({
          officeId,
          contractId,
          toConsultantId,
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo reasignar.');
      }
      toast.success('Asesor reasignado.');
      close();
      onReassigned();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'Error al reasignar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Reasignar
      </Button>

      <AppDialog
        open={open}
        title="Reasignar asesor"
        description="La póliza, el cliente y la cobranza se conservan. Solo cambia el asesor responsable (misma promotoría)."
        onClose={close}
        busy={submitting}
        size="md"
      >
        <div className="space-y-4">
          <FormField
            label="Nuevo asesor"
            htmlFor="to-consultant"
            variant="auth"
            error={fieldErrors.toConsultantId}
          >
            <select
              id="to-consultant"
              value={toConsultantId}
              disabled={loadingList || submitting}
              onChange={(e) => setToConsultantId(e.target.value)}
              className={selectClass}
            >
              <option value="">
                {loadingList ? 'Cargando…' : 'Selecciona un asesor'}
              </option>
              {consultants.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.consultant_code ? ` (${c.consultant_code})` : ''}
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Nota (opcional)" htmlFor="reassign-notes" variant="auth">
            <Input
              id="reassign-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Motivo del cambio"
             
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-1">
            <Button type="button" variant="outline" size="lg" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="brand"
              size="lg"
              disabled={submitting || !toConsultantId}
              onClick={() => void handleSubmit()}
            >
              {submitting ? 'Guardando…' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </AppDialog>
    </>
  );
}
