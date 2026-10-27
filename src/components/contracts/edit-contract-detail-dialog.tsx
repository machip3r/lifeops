'use client';

import { useState } from 'react';
import type { ContractDetail } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { updateContractDetailAction } from '@/app/dashboard/contracts/actions';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/contracts/payment-methods';
import { CURRENCY_LABELS, normalizeCurrency } from '@/lib/contracts/currencies';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormSection } from '@/components/ui/form-section';
import { filterCode, filterLabelText, filterSignedAmountText } from '@/lib/validation/input-filters';
import { FormSkeleton } from '@/components/ui/skeleton';

type Props = {
  open: boolean;
  /** Receipt to edit; null when closed */
  detail: ContractDetail | null;
  /** Póliza currency, shown next to the amounts */
  currency?: string | null;
  onClose: () => void;
  onSaved: (next: ContractDetail) => void;
};

type AmountField =
  | 'premiumPayment'
  | 'collectionPremium'
  | 'targetPremium'
  | 'commissionPremium'
  | 'commissionHonoraries'
  | 'commissionPercentage';

type Values = {
  receiptNumber: string;
  issueDate: string;
  paymentDate: string;
  paymentMethod: string;
  seniority: string;
  movement: string;
} & Record<AmountField, string>;

const amountText = (value: number | null | undefined) => (value == null ? '' : String(value));

function toValues(detail: ContractDetail | null): Values {
  return {
    receiptNumber: detail?.receipt_number ?? '',
    issueDate: detail?.issue_date?.slice(0, 10) ?? '',
    paymentDate: detail?.payment_date?.slice(0, 10) ?? '',
    paymentMethod: detail?.payment_method ?? '',
    seniority: detail?.seniority ?? '',
    movement: detail?.movement ?? '',
    premiumPayment: amountText(detail?.premium_payment),
    collectionPremium: amountText(detail?.collection_premium),
    targetPremium: amountText(detail?.target_premium),
    commissionPremium: amountText(detail?.commission_premium),
    commissionHonoraries: amountText(detail?.commission_honoraries),
    commissionPercentage: amountText(detail?.commission_percentage),
  };
}

/** Edit one commission-file receipt (Server Action + `contract_detail.update` audit). */
export function EditContractDetailDialog({ open, detail, currency, onClose, onSaved }: Props) {
  const { session } = useAuth();
  const [values, setValues] = useState<Values>(() => toValues(detail));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formKey = open && detail ? `${detail.id}\0${detail.updated_at ?? ''}` : 'closed';
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    if (open && detail) {
      setValues(toValues(detail));
      setFieldErrors({});
      setError('');
    }
  }

  const set = (patch: Partial<Values>) => setValues((prev) => ({ ...prev, ...patch }));
  const currencyLabel = CURRENCY_LABELS[normalizeCurrency(currency) as keyof typeof CURRENCY_LABELS] ?? null;

  const close = () => {
    if (saving) return;
    onClose();
  };

  // Values from the file outside the catalog stay selectable so they are not lost silently
  const legacyPayment =
    values.paymentMethod &&
    !PAYMENT_METHOD_OPTIONS.includes(values.paymentMethod as (typeof PAYMENT_METHOD_OPTIONS)[number])
      ? values.paymentMethod
      : null;

  const save = async () => {
    if (!detail) return;
    if (!session?.access_token) {
      setError('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const result = await updateContractDetailAction(session.access_token, { detailId: detail.id, ...values });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.error);
        return;
      }
      onSaved(result.data);
      onClose();
    } catch (err) {
      console.error('updateContractDetailAction:', err);
      setError('No se pudo guardar el recibo. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  const amountInput = (field: AmountField, label: string, hint?: string) => (
    <FormField label={label} htmlFor={`edit-detail-${field}`} variant="auth" hint={hint} error={fieldErrors[field]}>
      <Input
        id={`edit-detail-${field}`}
        inputMode="decimal"
        value={values[field]}
        maxLength={32}
        disabled={saving}
        placeholder="0.00"
        className="tabular-nums"
        aria-invalid={Boolean(fieldErrors[field])}
        onChange={(e) => set({ [field]: filterSignedAmountText(e.target.value) })}
      />
    </FormField>
  );

  return (
    <AppDialog
      open={open}
      title={detail?.receipt_number ? `Editar recibo ${detail.receipt_number}` : 'Editar recibo'}
      description="Corrige un renglón del archivo de comisiones. Los cambios quedan en el historial de la póliza; si vuelves a subir un archivo con este recibo, se actualiza con lo que diga el archivo."
      onClose={close}
      busy={saving}
      size="xl"
      footer={
        <>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={close}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-detail-form" variant="brand" size="lg" disabled={!detail || saving}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {detail ? (
        <form
          id="edit-detail-form"
          className="space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection title="Recibo" description="La fecha de pago y la prima cobro marcan el mes pagado en Cobranza.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Número de recibo" htmlFor="edit-detail-receipt" variant="auth" hint="RECIBO" error={fieldErrors.receiptNumber}>
                <Input
                  id="edit-detail-receipt"
                  value={values.receiptNumber}
                  maxLength={64}
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={saving}
                  className="font-mono"
                  aria-invalid={Boolean(fieldErrors.receiptNumber)}
                  onChange={(e) => set({ receiptNumber: filterCode(e.target.value) })}
                />
              </FormField>
              <FormField label="Fecha de pago" htmlFor="edit-detail-payment-date" variant="auth" error={fieldErrors.paymentDate}>
                <DateInput
                  id="edit-detail-payment-date"
                  value={values.paymentDate}
                  onChange={(paymentDate) => set({ paymentDate })}
                  aria-invalid={Boolean(fieldErrors.paymentDate)}
                />
              </FormField>
              <FormField label="Fecha de emisión" htmlFor="edit-detail-issue-date" variant="auth" error={fieldErrors.issueDate}>
                <DateInput
                  id="edit-detail-issue-date"
                  value={values.issueDate}
                  onChange={(issueDate) => set({ issueDate })}
                  aria-invalid={Boolean(fieldErrors.issueDate)}
                />
              </FormField>
              <FormField label="Forma de pago" htmlFor="edit-detail-payment-method" variant="auth" error={fieldErrors.paymentMethod}>
                <Select
                  id="edit-detail-payment-method"
                  value={values.paymentMethod}
                  disabled={saving}
                  onChange={(e) => set({ paymentMethod: e.target.value })}
                >
                  <option value="">Sin forma de pago</option>
                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                  {legacyPayment ? <option value={legacyPayment}>{legacyPayment} (del archivo)</option> : null}
                </Select>
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Primas" description={currencyLabel ? `En ${currencyLabel.toLowerCase()}, la moneda de la póliza.` : undefined}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {amountInput('premiumPayment', 'Prima pago')}
              {amountInput('collectionPremium', 'Prima cobro')}
              {amountInput('targetPremium', 'Prima meta')}
              {amountInput('commissionPremium', 'Prima comisión')}
            </div>
          </FormSection>

          <FormSection title="Comisión" description="Puede ser negativa cuando el archivo trae un ajuste o una devolución.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {amountInput('commissionHonoraries', 'Comisión / honorarios')}
              {amountInput('commissionPercentage', '% comisión', 'Ej. 12.5')}
            </div>
          </FormSection>

          <FormSection title="Otros datos del archivo">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Antigüedad" htmlFor="edit-detail-seniority" variant="auth" hint="Opcional" error={fieldErrors.seniority}>
                <Input
                  id="edit-detail-seniority"
                  value={values.seniority}
                  maxLength={40}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.seniority)}
                  onChange={(e) => set({ seniority: filterLabelText(e.target.value) })}
                />
              </FormField>
              <FormField label="Movimiento" htmlFor="edit-detail-movement" variant="auth" hint="Opcional" error={fieldErrors.movement}>
                <Input
                  id="edit-detail-movement"
                  value={values.movement}
                  maxLength={80}
                  disabled={saving}
                  aria-invalid={Boolean(fieldErrors.movement)}
                  onChange={(e) => set({ movement: filterLabelText(e.target.value) })}
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
      ) : (
        <FormSkeleton fields={8} />
      )}
    </AppDialog>
  );
}
