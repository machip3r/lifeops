'use client';

import { useEffect, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { db } from '@/lib/db';
import type { Client, Consultant } from '@/lib/supabase';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { filterEntityName } from '@/lib/validation/input-filters';

type Target = 'consultant' | 'client';

type Props = {
  officeId: string;
  contractId: string;
  currentConsultantId: string;
  currentClientId?: string | null;
  onReassigned: () => void;
};

/** Reasignar (promotoría): move the póliza to another asesor, or to another client (duplicates). */
export function ReassignConsultantDialog({
  officeId,
  contractId,
  currentConsultantId,
  currentClientId,
  onReassigned,
}: Props) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<Target>('consultant');
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [toConsultantId, setToConsultantId] = useState('');
  const [toClientId, setToClientId] = useState('');
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
        const [consultantList, clientList] = await Promise.all([
          db.consultant.getConsultantsByOffice(officeId),
          db.client.getAllClients(officeId),
        ]);
        if (cancelled) return;
        setConsultants(consultantList.filter((c) => c.id !== currentConsultantId && c.status !== 'INACTIVE'));
        setClients(clientList.filter((c) => c.id !== currentClientId));
      } catch (e) {
        console.error(e);
        toast.error('No se pudieron cargar asesores y clientes.');
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, officeId, currentConsultantId, currentClientId, toast]);

  const close = () => {
    if (submitting) return;
    setOpen(false);
    setTarget('consultant');
    setToConsultantId('');
    setToClientId('');
    setNotes('');
    setFieldErrors({});
  };

  const selected = target === 'consultant' ? toConsultantId : toClientId;

  const handleSubmit = async () => {
    setFieldErrors({});
    if (!selected) {
      setFieldErrors(target === 'consultant' ? { toConsultantId: 'Elige un asesor.' } : { toClientId: 'Elige un cliente.' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await authFetch('/api/contracts/reassign', {
        method: 'POST',
        body: JSON.stringify({
          officeId,
          contractId,
          ...(target === 'consultant' ? { toConsultantId } : { toClientId }),
          notes: notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error || 'No se pudo reasignar.');
      }
      if (target === 'client') {
        toast.success(
          data.fromClientRemaining === 0
            ? `Póliza movida a ${data.toClientName}. El cliente anterior ya no tiene pólizas; puedes eliminarlo desde su expediente.`
            : `Póliza movida a ${data.toClientName}.`,
        );
      } else {
        toast.success('Asesor reasignado.');
      }
      close();
      onReassigned();
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : 'No se pudo reasignar.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="default" className="h-10 gap-2 px-3.5" onClick={() => setOpen(true)}>
        <ArrowLeftRight className="h-4 w-4" aria-hidden />
        Reasignar
      </Button>

      <AppDialog
        open={open}
        title="Reasignar póliza"
        description={
          target === 'consultant'
            ? 'Cambia el asesor responsable. Cliente, recibos y cobranza se conservan.'
            : 'Pásala a otro cliente, por ejemplo si el mismo cliente quedó registrado dos veces. Recibos y cobranza se conservan.'
        }
        onClose={close}
        busy={submitting}
        size="md"
        footer={
          <>
            <Button type="button" variant="outline" size="lg" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="button" variant="brand" size="lg" disabled={submitting || !selected} onClick={() => void handleSubmit()}>
              {submitting ? 'Guardando…' : 'Reasignar'}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <SegmentedControl
            label="Qué quieres reasignar"
            value={target}
            onChange={(next) => {
              setTarget(next);
              setFieldErrors({});
            }}
            options={[
              { value: 'consultant', label: 'Asesor' },
              { value: 'client', label: 'Cliente' },
            ]}
          />

          {target === 'consultant' ? (
            <FormField label="Nuevo asesor" htmlFor="to-consultant" variant="auth" error={fieldErrors.toConsultantId}>
              {loadingList ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Combobox
                  id="to-consultant"
                  value={toConsultantId}
                  disabled={submitting}
                  onChange={setToConsultantId}
                  options={consultants.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.consultant_code ? `Clave ${c.consultant_code}` : undefined,
                  }))}
                  placeholder="Busca por nombre o clave…"
                  emptyText="No encontramos ese asesor."
                />
              )}
            </FormField>
          ) : (
            <FormField
              label="Nuevo cliente"
              htmlFor="to-client"
              variant="auth"
              hint="Si el cliente anterior se queda sin pólizas, podrás eliminarlo desde su expediente."
              error={fieldErrors.toClientId}
            >
              {loadingList ? (
                <Skeleton className="h-12 w-full" />
              ) : (
                <Combobox
                  id="to-client"
                  value={toClientId}
                  disabled={submitting}
                  onChange={setToClientId}
                  options={clients.map((c) => ({
                    value: c.id,
                    label: c.name,
                    description: c.rfc || c.curp || undefined,
                  }))}
                  placeholder="Busca por nombre, RFC o CURP…"
                  emptyText="No encontramos ese cliente."
                />
              )}
            </FormField>
          )}

          <FormField label="Nota" htmlFor="reassign-notes" variant="auth" hint="Opcional. Queda en el historial.">
            <Input
              id="reassign-notes"
              value={notes}
              maxLength={500}
              onChange={(e) => setNotes(filterEntityName(e.target.value))}
              placeholder="Motivo del cambio"
            />
          </FormField>
        </div>
      </AppDialog>
    </>
  );
}
