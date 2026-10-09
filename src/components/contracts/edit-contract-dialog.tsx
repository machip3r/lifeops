'use client';

import { useState } from 'react';
import { db } from '@/lib/db';
import type { Contract } from '@/lib/supabase';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/contracts/payment-methods';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { CURRENCY_OPTIONS, currencyToStore, normalizeCurrency } from '@/lib/contracts/currencies';

type Props = {
  open: boolean;
  contract: Contract;
  onClose: () => void;
  onSaved: (next: Contract) => void;
};

const selectClass =
  'h-12 w-full rounded-lg border border-input bg-transparent px-3 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';

export function EditContractDialog({ open, contract, onClose, onSaved }: Props) {
  const [payment, setPayment] = useState(contract.payment_method ?? '');
  const [premium, setPremium] = useState(contract.annual_premium ?? '');
  const [insured, setInsured] = useState(contract.insured_amount ?? '');
  const [currency, setCurrency] = useState(
    () => normalizeCurrency(contract.currency) || contract.currency?.trim() || ''
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const formKey = open
    ? `${contract.id}\0${contract.payment_method ?? ''}\0${contract.annual_premium ?? ''}\0${contract.insured_amount ?? ''}\0${contract.currency ?? ''}`
    : 'closed';
  const [seenKey, setSeenKey] = useState(formKey);
  if (seenKey !== formKey) {
    setSeenKey(formKey);
    if (open) {
      setPayment(contract.payment_method ?? '');
      setPremium(contract.annual_premium ?? '');
      setInsured(contract.insured_amount ?? '');
      setCurrency(normalizeCurrency(contract.currency) || contract.currency?.trim() || '');
      setError('');
    }
  }

  const close = () => {
    if (saving) return;
    onClose();
  };

  const paymentOptions = [
    ...PAYMENT_METHOD_OPTIONS,
    ...(payment &&
    !PAYMENT_METHOD_OPTIONS.includes(payment as (typeof PAYMENT_METHOD_OPTIONS)[number])
      ? [payment]
      : []),
  ];

  const save = async () => {
    const clean = (value: string) => value.replace(/[\u0000-\u001F\u007F]/g, '').trim();
    setSaving(true);
    setError('');
    try {
      const updated = await db.contract.updateContract(contract.id, {
        payment_method: payment.trim() || null,
        annual_premium: clean(premium).slice(0, 64) || null,
        insured_amount: clean(insured).slice(0, 64) || null,
        currency: currencyToStore(currency),
      });
      onSaved(updated);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la póliza.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppDialog
      open={open}
      title="Editar póliza"
      description={`Póliza ${contract.contract_number || ''}. Cliente y asesor se cambian aparte.`}
      onClose={close}
      busy={saving}
      size="md"
    >
      <div className="space-y-4">
        <FormField label="Forma de pago" htmlFor="edit-contract-payment" variant="auth">
          <select
            id="edit-contract-payment"
            value={payment}
            disabled={saving}
            onChange={(e) => setPayment(e.target.value)}
            className={selectClass}
          >
            <option value="">Sin definir</option>
            {paymentOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Prima anual" htmlFor="edit-contract-premium" variant="auth">
            <Input
              id="edit-contract-premium"
              value={premium}
              maxLength={64}
              disabled={saving}
              onChange={(e) => setPremium(e.target.value)}
            />
          </FormField>
          <FormField label="Suma asegurada" htmlFor="edit-contract-insured" variant="auth">
            <Input
              id="edit-contract-insured"
              value={insured}
              maxLength={64}
              disabled={saving}
              onChange={(e) => setInsured(e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Moneda" htmlFor="edit-contract-currency" variant="auth">
          <select
            id="edit-contract-currency"
            className={selectClass}
            value={currency}
            disabled={saving}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="">Selecciona</option>
            {CURRENCY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
            {currency && !normalizeCurrency(currency) ? (
              <option value={currency}>{currency}</option>
            ) : null}
          </select>
        </FormField>
        {error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-3 pt-1">
          <Button type="button" variant="outline" size="lg" disabled={saving} onClick={close}>
            Cancelar
          </Button>
          <Button type="button" variant="brand" size="lg" disabled={saving} onClick={() => void save()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
