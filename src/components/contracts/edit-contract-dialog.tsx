'use client';

import { useState } from 'react';
import type { Contract } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { updateContractAction } from '@/app/dashboard/contracts/actions';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/contracts/payment-methods';
import { CURRENCY_LABELS, CURRENCY_OPTIONS, normalizeCurrency } from '@/lib/contracts/currencies';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/date-input';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { FormSection } from '@/components/ui/form-section';
import { filterAmountText, filterCode, filterDigits, filterEntityName } from '@/lib/validation/input-filters';
import { LIMITS } from '@/lib/validation/schemas';
import { FormSkeleton } from '@/components/ui/skeleton';

type Props = {
  open: boolean;
  /** Póliza to edit; null while it loads */
  contract: Contract | null;
  onClose: () => void;
  onSaved: (next: Contract) => void;
};

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Activa' },
  { value: 'PENDING', label: 'En trámite' },
  { value: 'INACTIVE', label: 'Inactiva (cancelada)' },
] as const;

type Values = {
  contractNumber: string;
  issueDate: string;
  paymentMethod: string;
  collectionDay: string;
  currency: string;
  annualPremium: string;
  insuredAmount: string;
  projectName: string;
  status: string;
};

function toValues(contract: Contract | null): Values {
  return {
    contractNumber: contract?.contract_number ?? '',
    issueDate: contract?.issue_date?.slice(0, 10) ?? '',
    paymentMethod: contract?.payment_method ?? '',
    collectionDay: contract?.collection_day ? String(contract.collection_day) : '',
    currency: normalizeCurrency(contract?.currency) || '',
    annualPremium: contract?.annual_premium ?? '',
    insuredAmount: contract?.insured_amount ?? '',
    projectName: contract?.project_name ?? '',
    status: contract?.status === 'INACTIVE' || contract?.status === 'PENDING' ? contract.status : 'ACTIVE',
  };
}

/** Full póliza edit (Server Action + `contract.update` audit). Asesor changes go through Reasignar. */
export function EditContractDialog({ open, contract, onClose, onSaved }: Props) {
  const { session } = useAuth();
  const [values, setValues] = useState<Values>(() => toValues(contract));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formKey = open && contract ? `${contract.id}\0${contract.updated_at ?? ''}` : 'closed';
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    if (open && contract) {
      setValues(toValues(contract));
      setFieldErrors({});
      setError('');
    }
  }

  const set = (patch: Partial<Values>) => setValues((prev) => ({ ...prev, ...patch }));

  const close = () => {
    if (saving) return;
    onClose();
  };

  // Legacy values outside the catalog stay selectable so they are not lost silently
  const legacyPayment =
    values.paymentMethod &&
    !PAYMENT_METHOD_OPTIONS.includes(values.paymentMethod as (typeof PAYMENT_METHOD_OPTIONS)[number])
      ? values.paymentMethod
      : null;

  const save = async () => {
    if (!contract) return;
    if (!session?.access_token) {
      setError('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const result = await updateContractAction(session.access_token, {
        contractId: contract.id,
        contractNumber: values.contractNumber,
        issueDate: values.issueDate,
        paymentMethod: values.paymentMethod,
        collectionDay: values.collectionDay ? Number(values.collectionDay) : null,
        currency: values.currency,
        annualPremium: values.annualPremium,
        insuredAmount: values.insuredAmount,
        projectName: values.projectName,
        status: values.status,
      });
      if (!result.ok) {
        setFieldErrors(result.fieldErrors ?? {});
        setError(result.error);
        return;
      }
      onSaved(result.data);
      onClose();
    } catch (err) {
      console.error('updateContractAction:', err);
      setError('No se pudo guardar la póliza. Intenta de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title={contract?.contract_number ? `Editar póliza ${contract.contract_number}` : 'Editar póliza'}
      description="Los cambios quedan en el historial. El asesor se cambia con «Reasignar»."
      onClose={close}
      busy={saving}
      size="lg"
      footer={
        <>
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={close}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="edit-contract-form"
            variant="brand"
            size="lg"
            disabled={!contract || saving || !values.contractNumber.trim()}
          >
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </>
      }
    >
      {contract ? (
        <form
          id="edit-contract-form"
          className="space-y-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <FormSection title="Póliza">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Número de póliza" htmlFor="edit-contract-number" variant="auth" error={fieldErrors.contractNumber}>
                <Input
                  id="edit-contract-number"
                  value={values.contractNumber}
                  maxLength={LIMITS.contractNumber}
                  autoCapitalize="characters"
                  spellCheck={false}
                  disabled={saving}
                  className="font-mono"
                  onChange={(e) => set({ contractNumber: filterCode(e.target.value) })}
                />
              </FormField>
              <FormField label="Estado" htmlFor="edit-contract-status" variant="auth" error={fieldErrors.status}>
                <Select id="edit-contract-status" value={values.status} disabled={saving} onChange={(e) => set({ status: e.target.value })}>
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <FormField label="Proyecto o plan" htmlFor="edit-contract-project" variant="auth" hint="Opcional" error={fieldErrors.projectName}>
              <Input
                id="edit-contract-project"
                value={values.projectName}
                maxLength={LIMITS.entityName}
                disabled={saving}
                onChange={(e) => set({ projectName: filterEntityName(e.target.value) })}
              />
            </FormField>
          </FormSection>

          <FormSection title="Cobranza" description="La emisión y la forma de pago arman el calendario de recibos.">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Fecha de emisión" htmlFor="edit-contract-issue" variant="auth" error={fieldErrors.issueDate}>
                <DateInput
                  id="edit-contract-issue"
                  value={values.issueDate}
                  onChange={(issueDate) => set({ issueDate })}
                  aria-invalid={Boolean(fieldErrors.issueDate)}
                />
              </FormField>
              <FormField label="Forma de pago" htmlFor="edit-contract-payment" variant="auth" error={fieldErrors.paymentMethod}>
                <Select
                  id="edit-contract-payment"
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
                  {legacyPayment ? <option value={legacyPayment}>{legacyPayment} (corrígela)</option> : null}
                </Select>
              </FormField>
              <FormField label="Día de cobro" htmlFor="edit-contract-day" variant="auth" hint="Opcional · 1 a 31" error={fieldErrors.collectionDay}>
                <Input
                  id="edit-contract-day"
                  inputMode="numeric"
                  value={values.collectionDay}
                  maxLength={2}
                  disabled={saving}
                  placeholder="Ej. 15"
                  onChange={(e) => {
                    const day = filterDigits(e.target.value, 2);
                    if (day === '' || Number(day) <= 31) set({ collectionDay: day });
                  }}
                />
              </FormField>
            </div>
          </FormSection>

          <FormSection title="Montos" description="Opcionales; se muestran en la moneda de la póliza.">
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Moneda" htmlFor="edit-contract-currency" variant="auth" error={fieldErrors.currency}>
                <Select id="edit-contract-currency" value={values.currency} disabled={saving} onChange={(e) => set({ currency: e.target.value })}>
                  <option value="">Sin moneda</option>
                  {CURRENCY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {CURRENCY_LABELS[option]}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label="Prima anual" htmlFor="edit-contract-premium" variant="auth" error={fieldErrors.annualPremium}>
                <Input
                  id="edit-contract-premium"
                  inputMode="decimal"
                  value={values.annualPremium}
                  maxLength={32}
                  disabled={saving}
                  placeholder="0.00"
                  className="tabular-nums"
                  onChange={(e) => set({ annualPremium: filterAmountText(e.target.value) })}
                />
              </FormField>
              <FormField label="Suma asegurada" htmlFor="edit-contract-insured" variant="auth" error={fieldErrors.insuredAmount}>
                <Input
                  id="edit-contract-insured"
                  inputMode="decimal"
                  value={values.insuredAmount}
                  maxLength={32}
                  disabled={saving}
                  placeholder="0.00"
                  className="tabular-nums"
                  onChange={(e) => set({ insuredAmount: filterAmountText(e.target.value) })}
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
        <FormSkeleton fields={6} />
      )}
    </AppDialog>
  );
}
