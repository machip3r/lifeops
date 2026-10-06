'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { uploadPaymentEvidence } from '@/lib/documents/upload';
import { formatDateShortEsLocal } from '@/lib/format/date';
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  LIMITS,
} from '@/lib/validation/schemas';
import { upsertCollectionPaymentAction } from '@/app/dashboard/collections/actions';

export type RegisterPaymentTarget = {
  contractId: string;
  contractNumber: string | null;
  clientName: string | null;
  /** Suggested next due — used to default year/month and paidAt. */
  nextDue: Date | null;
  suggestedAmount?: number | null;
  collectionDay?: number | null;
};

type Props = {
  open: boolean;
  target: RegisterPaymentTarget | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const MONTH_LABELS = [
  'ENE',
  'FEB',
  'MAR',
  'ABR',
  'MAY',
  'JUN',
  'JUL',
  'AGO',
  'SEP',
  'OCT',
  'NOV',
  'DIC',
];

export function RegisterPaymentDialog({
  open,
  target,
  onClose,
  onSaved,
}: Props) {
  const { session } = useAuth();
  const { toast } = useToast();
  const accessToken = session?.access_token ?? '';

  const [paidAt, setPaidAt] = useState('');
  const [scheduledDay, setScheduledDay] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<globalThis.File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !target) return;
    const due = target.nextDue ?? new Date();
    setPaidAt(toIsoDateLocal(due));
    setScheduledDay(
      target.collectionDay != null
        ? String(target.collectionDay)
        : String(due.getDate()),
    );
    setAmount(
      target.suggestedAmount != null && target.suggestedAmount > 0
        ? String(target.suggestedAmount)
        : '',
    );
    setNotes('');
    setEvidenceFile(null);
    setFieldErrors({});
  }, [open, target]);

  if (!open || !target) return null;

  const canSubmit =
    paidAt.trim().length === 10 && evidenceFile != null && !submitting;

  const handleSave = async () => {
    setFieldErrors({});
    if (!evidenceFile) {
      setFieldErrors({
        evidence: 'Adjunta una foto o PDF como evidencia del pago.',
      });
      return;
    }
    if (evidenceFile.size <= 0 || evidenceFile.size > LIMITS.documentFileBytes) {
      setFieldErrors({
        evidence: 'El archivo supera el tamaño máximo permitido (20 MB).',
      });
      return;
    }
    if (
      !DOCUMENT_ALLOWED_MIME_TYPES.includes(
        evidenceFile.type as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number],
      )
    ) {
      setFieldErrors({
        evidence: 'Tipos permitidos: imagen, PDF u Office.',
      });
      return;
    }
    if (!accessToken) {
      toast.error('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }

    const year = Number.parseInt(paidAt.slice(0, 4), 10);
    const month = Number.parseInt(paidAt.slice(5, 7), 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) {
      setFieldErrors({ paidAt: 'Ingresa una fecha válida.' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await upsertCollectionPaymentAction(accessToken, {
        contractId: target.contractId,
        year,
        month,
        paidAt,
        scheduledDay: scheduledDay ? Number(scheduledDay) : null,
        amount: amount.trim() === '' ? null : Number(amount),
        notes,
      });
      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        toast.error(result.error);
        return;
      }

      if (result.data?.id) {
        const monthLabel = MONTH_LABELS[month - 1] ?? String(month);
        const upload = await uploadPaymentEvidence({
          contractId: target.contractId,
          collectionPaymentId: result.data.id,
          file: evidenceFile,
          displayName: `Evidencia ${monthLabel} ${year}`,
        });
        if (!upload.ok) {
          toast.error(
            `Pago guardado, pero la evidencia falló: ${upload.error}`,
          );
          await onSaved();
          onClose();
          return;
        }
      }

      toast.success('Pago y evidencia registrados.');
      await onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar el pago.');
    } finally {
      setSubmitting(false);
    }
  };

  const dueHint = target.nextDue
    ? `Próximo cobro sugerido: ${formatDateShortEsLocal(target.nextDue)}`
    : undefined;

  return (
    <AppDialog
      open={open}
      title="Registrar pago"
      description={`${target.contractNumber || 'Sin póliza'} · ${target.clientName || 'Sin cliente'}`}
      onClose={onClose}
      busy={submitting}
      size="md"
    >
      <div className="space-y-4">
        {dueHint ? (
          <p className="text-sm text-[#9ca3af]">{dueHint}</p>
        ) : null}

        <FormField
          label="Fecha real de pago *"
          htmlFor="register-paid-at"
          variant="auth"
          error={fieldErrors.paidAt}
        >
          <Input
            id="register-paid-at"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
          />
        </FormField>

        <FormField
          label="Día de cobro (calendario)"
          htmlFor="register-scheduled-day"
          variant="auth"
          error={fieldErrors.scheduledDay}
          hint="Día del mes que se usa para el siguiente cobro"
        >
          <Input
            id="register-scheduled-day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={scheduledDay}
            onChange={(e) => setScheduledDay(e.target.value)}
          />
        </FormField>

        <FormField
          label="Monto (opcional)"
          htmlFor="register-amount"
          variant="auth"
          error={fieldErrors.amount}
        >
          <Input
            id="register-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </FormField>

        <FormField
          label="Notas (opcional)"
          htmlFor="register-notes"
          variant="auth"
          error={fieldErrors.notes}
          hint={`Máximo ${LIMITS.notes} caracteres`}
        >
          <Textarea
            id="register-notes"
            value={notes}
            maxLength={LIMITS.notes}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-[#1a1d23]"
          />
        </FormField>

        <FormField
          label="Evidencia de pago *"
          htmlFor="register-evidence"
          variant="auth"
          error={fieldErrors.evidence}
          hint="Imagen o PDF (máx. 20 MB). Obligatoria al registrar el pago."
        >
          <Input
            id="register-evidence"
            type="file"
            accept={DOCUMENT_ALLOWED_MIME_TYPES.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setEvidenceFile(file);
              if (file) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.evidence;
                  return next;
                });
              }
            }}
          />
        </FormField>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            size="lg"
            onClick={onClose}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={!canSubmit}
            onClick={() => void handleSave()}
          >
            {submitting ? 'Guardando…' : 'Guardar pago'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
