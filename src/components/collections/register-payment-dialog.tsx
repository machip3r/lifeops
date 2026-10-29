'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { FileDropzone } from '@/components/ui/file-dropzone';
import { Textarea } from '@/components/ui/textarea';
import { uploadPaymentEvidence } from '@/lib/documents/upload';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { Coins } from 'lucide-react';
import { CURRENCY_CODES, CURRENCY_LABELS, normalizeCurrency } from '@/lib/contracts/currencies';
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
  /** Póliza currency: the payment is registered in it */
  currency?: string | null;
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
  const formKey = open && target
    ? `${target.contractId}\0${target.nextDue?.toISOString() ?? ''}\0${target.collectionDay ?? ''}\0${target.suggestedAmount ?? ''}`
    : 'closed';
  const [seenFormKey, setSeenFormKey] = useState(formKey);
  if (seenFormKey !== formKey) {
    setSeenFormKey(formKey);
    if (open && target) {
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
    }
  }

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

  const currencyCode = normalizeCurrency(target.currency);
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
      footer={
        <>
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" size="lg" disabled={!canSubmit} onClick={() => void handleSave()}>
            {submitting ? 'Guardando…' : 'Guardar pago'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {dueHint ? (
          <p className="text-sm text-(--lifeops-muted)">{dueHint}</p>
        ) : null}

        <p className="flex items-start gap-2.5 rounded-lg border border-(--lifeops-border) bg-(--lifeops-hover)/40 px-3 py-2.5 text-sm text-(--lifeops-fg)">
          <Coins className="mt-0.5 h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden />
          {currencyCode ? (
            <span>
              El pago se registra en{' '}
              <span className="font-semibold">
                {CURRENCY_LABELS[currencyCode]} ({CURRENCY_CODES[currencyCode]})
              </span>
              , la moneda de la póliza.
            </span>
          ) : (
            <span className="text-(--lifeops-muted)">
              La póliza no tiene moneda. El monto se guarda sin moneda; complétala en «Editar» de la póliza.
            </span>
          )}
        </p>

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
          label={currencyCode ? `Monto en ${CURRENCY_CODES[currencyCode]} (opcional)` : 'Monto (opcional)'}
          htmlFor="register-amount"
          variant="auth"
          error={fieldErrors.amount}
        >
          <div className="relative">
            <Input
              id="register-amount"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={currencyCode ? 'pr-16' : undefined}
            />
            {currencyCode ? (
              <span
                className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-(--lifeops-accent)"
                aria-hidden
              >
                {CURRENCY_CODES[currencyCode]}
              </span>
            ) : null}
          </div>
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
            className="max-h-32 resize-y overflow-y-auto"
          />
        </FormField>

        <FormField
          label="Evidencia de pago"
          htmlFor="register-evidence"
          variant="auth"
          error={fieldErrors.evidence}
          hint="Obligatoria: la foto o el PDF del comprobante."
        >
          <FileDropzone
            id="register-evidence"
            file={evidenceFile}
            accept={DOCUMENT_ALLOWED_MIME_TYPES}
            maxBytes={LIMITS.documentFileBytes}
            disabled={submitting}
            onChange={(file) => {
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
      </div>
    </AppDialog>
  );
}
