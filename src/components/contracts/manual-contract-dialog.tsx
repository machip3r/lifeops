'use client';

import { useEffect, useMemo, useState } from 'react';
import { createManualContractAction } from '@/app/dashboard/contracts/actions';
import { useAuth } from '@/contexts/auth-context';
import { InviteConsultantDialog } from '@/components/consultants/invite-consultant-dialog';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Combobox } from '@/components/ui/combobox';
import { DateInput } from '@/components/ui/date-input';
import { FormSection } from '@/components/ui/form-section';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { filterCode, filterDigits, filterPersonName, filterTaxId } from '@/lib/validation/input-filters';
import { PAYMENT_METHOD_OPTIONS } from '@/lib/contracts/payment-methods';
import { PROJECT_NAME_OPTIONS } from '@/lib/contracts/project-names';
import { db } from '@/lib/db';
import type { Client, Consultant } from '@/lib/supabase';
import { LIMITS } from '@/lib/validation/schemas';
import { Skeleton } from '@/components/ui/skeleton';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

function todayIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function ManualContractDialog({ open, onClose, onCreated }: Props) {
  const { profile, session } = useAuth();
  const { toast } = useToast();
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingLists, setLoadingLists] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const [consultantId, setConsultantId] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [clientMode, setClientMode] = useState<'existing' | 'new'>('existing');
  const [clientId, setClientId] = useState('');
  const [clientName, setClientName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [clientCurp, setClientCurp] = useState('');
  const [clientRfc, setClientRfc] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [collectionDay, setCollectionDay] = useState('');
  const [projectName, setProjectName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const isPromotory = profile?.role === 'promotory';
  const maxDate = todayIsoDate();

  const clientOptions = useMemo(
    () =>
      [...clients]
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
        .map((c) => ({ value: c.id, label: c.name, description: c.rfc || c.curp || undefined })),
    [clients],
  );

  const reloadConsultants = async (): Promise<Consultant[]> => {
    if (!profile?.id || profile.role !== 'promotory') return [];
    const cons = await db.consultant.getConsultantsByOffice(profile.id);
    const active = cons.filter((c) => c.status !== 'INACTIVE');
    setConsultants(active);
    return active;
  };

  useEffect(() => {
    if (!open || !profile?.id) return;
    let cancelled = false;
    (async () => {
      setLoadingLists(true);
      try {
        if (profile.role === 'promotory') {
          const [cons, cls] = await Promise.all([
            db.consultant.getConsultantsByOffice(profile.id),
            db.client.getAllClients(profile.id),
          ]);
          if (cancelled) return;
          setConsultants(cons.filter((c) => c.status !== 'INACTIVE'));
          setClients(cls);
          setClientMode(cls.length > 0 ? 'existing' : 'new');
        } else {
          setConsultantId(profile.id);
          const cls = await db.client.getClientsByConsultant(profile.id);
          if (cancelled) return;
          setClients(cls);
          setClientMode(cls.length > 0 ? 'existing' : 'new');
        }
      } catch (e) {
        console.error(e);
        toast.error('No se pudieron cargar asesores o clientes.');
      } finally {
        if (!cancelled) setLoadingLists(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, profile, toast]);

  const reset = () => {
    setConsultantId(profile?.role === 'consultant' ? profile.id : '');
    setContractNumber('');
    setClientMode('existing');
    setClientId('');
    setClientName('');
    setBirthDate('');
    setClientCurp('');
    setClientRfc('');
    setIssueDate('');
    setCollectionDay('');
    setProjectName('');
    setPaymentMethod('');
    setFieldErrors({});
    setFormError('');
    setInviteOpen(false);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleClientSelect = (id: string) => {
    setClientId(id);
    const found = clients.find((c) => c.id === id);
    if (found) {
      setClientName(found.name || '');
      setBirthDate(found.birth_date || '');
    }
  };

  const switchClientMode = (mode: 'existing' | 'new') => {
    setClientMode(mode);
    setClientId('');
    setClientName('');
    setBirthDate('');
    setClientCurp('');
    setClientRfc('');
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.clientId;
      delete next.clientName;
      delete next.curp;
      delete next.rfc;
      return next;
    });
  };

  const canSubmit =
    Boolean(contractNumber.trim()) &&
    Boolean(issueDate) &&
    Boolean(projectName) &&
    Boolean(paymentMethod) &&
    (!isPromotory || Boolean(consultantId)) &&
    (clientMode === 'existing'
      ? Boolean(clientId)
      : Boolean(clientName.trim()));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setFormError('');
    const token = session?.access_token;
    if (!token) {
      setFormError('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    if (birthDate && birthDate > maxDate) {
      setFieldErrors({ birthDate: 'La fecha de nacimiento no puede ser futura.' });
      return;
    }
    if (issueDate && issueDate > maxDate) {
      setFieldErrors({ issueDate: 'La fecha de emisión no puede ser futura.' });
      return;
    }

    setSubmitting(true);
    try {
      const result = await createManualContractAction(token, {
        consultantId: isPromotory ? consultantId || null : null,
        contractNumber: contractNumber.trim(),
        clientId: clientMode === 'existing' ? clientId || null : null,
        clientName:
          clientMode === 'existing'
            ? (clients.find((c) => c.id === clientId)?.name || clientName).trim()
            : clientName.trim(),
        birthDate: birthDate.trim() || null,
        curp: clientMode === 'new' ? clientCurp.trim().toUpperCase() || null : null,
        rfc: clientMode === 'new' ? clientRfc.trim().toUpperCase() || null : null,
        issueDate,
        collectionDay: collectionDay ? Number(collectionDay) : null,
        projectName,
        paymentMethod,
      });

      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        setFormError(result.error);
        return;
      }

      toast.success('Póliza registrada.');
      reset();
      onClose();
      onCreated();
    } catch (err) {
      console.error(err);
      setFormError('No se pudo registrar la póliza. Intenta de nuevo.');
    } finally {
      setSubmitting(false);
    }
  };

  const selectedClient = clientMode === 'existing' ? clients.find((c) => c.id === clientId) ?? null : null;
  const clientSummary = selectedClient
    ? [
        selectedClient.rfc || selectedClient.curp,
        selectedClient.birth_date ? `Nació el ${formatDateShortEsLocal(selectedClient.birth_date)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      <AppDialog
        open={open}
        title="Registrar póliza"
        description="Alta manual con lo mínimo para cobranza y recordatorios."
        onClose={handleClose}
        busy={submitting}
        size="lg"
        footer={
          <>
            <Button type="button" variant="outline" size="lg" onClick={handleClose} disabled={submitting}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="manual-contract-form"
              variant="brand"
              size="lg"
              disabled={submitting || !canSubmit || loadingLists}
            >
              {submitting ? 'Guardando…' : 'Registrar póliza'}
            </Button>
          </>
        }
      >
        <form id="manual-contract-form" onSubmit={handleSubmit} className="space-y-6" noValidate>
          <FormSection
            title="Cliente"
            description={clientMode === 'existing' ? 'Elige a quien ya está en LifeOps.' : 'Se crea junto con la póliza.'}
            actions={
              clients.length > 0 ? (
                <SegmentedControl
                  label="Tipo de cliente"
                  value={clientMode}
                  onChange={switchClientMode}
                  options={[
                    { value: 'existing', label: 'Existente' },
                    { value: 'new', label: 'Nuevo' },
                  ]}
                />
              ) : null
            }
          >
            {loadingLists ? (
              <Skeleton className="h-12 w-full" />
            ) : clientMode === 'existing' ? (
              <FormField
                label="Cliente"
                htmlFor="manual-client-select"
                variant="auth"
                hint={clientSummary || undefined}
                error={fieldErrors.clientId}
              >
                <Combobox
                  id="manual-client-select"
                  value={clientId}
                  onChange={handleClientSelect}
                  options={clientOptions}
                  placeholder="Busca por nombre, RFC o CURP…"
                  emptyText="No encontramos ese cliente. Cámbiate a «Nuevo» para registrarlo."
                />
              </FormField>
            ) : (
              <>
                <FormField label="Nombre completo" htmlFor="manual-client-name" variant="auth" error={fieldErrors.clientName}>
                  <Input
                    id="manual-client-name"
                    value={clientName}
                    onChange={(e) => setClientName(filterPersonName(e.target.value))}
                    maxLength={LIMITS.personName}
                    autoCapitalize="words"
                    required
                    placeholder="Nombre y apellidos"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-3">
                  <FormField
                    label="Nacimiento"
                    htmlFor="manual-birth-date"
                    variant="auth"
                    hint="Opcional"
                    error={fieldErrors.birthDate}
                  >
                    <DateInput id="manual-birth-date" value={birthDate} max={maxDate} onChange={setBirthDate} />
                  </FormField>
                  <FormField label="CURP" htmlFor="manual-client-curp" variant="auth" hint="Opcional" error={fieldErrors.curp}>
                    <Input
                      id="manual-client-curp"
                      value={clientCurp}
                      onChange={(e) => setClientCurp(filterTaxId(e.target.value))}
                      maxLength={18}
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="18 caracteres"
                      className="font-mono uppercase"
                    />
                  </FormField>
                  <FormField label="RFC" htmlFor="manual-client-rfc" variant="auth" hint="Opcional" error={fieldErrors.rfc}>
                    <Input
                      id="manual-client-rfc"
                      value={clientRfc}
                      onChange={(e) => setClientRfc(filterTaxId(e.target.value))}
                      maxLength={13}
                      autoCapitalize="characters"
                      spellCheck={false}
                      placeholder="12 o 13 caracteres"
                      className="font-mono uppercase"
                    />
                  </FormField>
                </div>
              </>
            )}
          </FormSection>

          <FormSection title="Póliza">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Número de póliza" htmlFor="manual-contract-number" variant="auth" error={fieldErrors.contractNumber}>
                <Input
                  id="manual-contract-number"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(filterCode(e.target.value))}
                  maxLength={LIMITS.contractNumber}
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  placeholder="VI0001566370"
                  className="font-mono"
                />
              </FormField>
              {isPromotory ? (
                <FormField
                  label="Asesor"
                  htmlFor="manual-consultant"
                  variant="auth"
                  error={fieldErrors.consultantId}
                  hint={
                    <button
                      type="button"
                      onClick={() => setInviteOpen(true)}
                      className="cursor-pointer text-(--lifeops-accent) hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
                    >
                      ¿No está en la lista? Créalo
                    </button>
                  }
                >
                  {loadingLists ? (
                    <Skeleton className="h-12 w-full" />
                  ) : (
                    <Combobox
                      id="manual-consultant"
                      value={consultantId}
                      onChange={setConsultantId}
                      options={consultants.map((c) => ({
                        value: c.id,
                        label: c.name || 'Sin nombre',
                        description: c.consultant_code ? `Clave ${c.consultant_code}` : undefined,
                      }))}
                      placeholder="Busca por nombre o clave…"
                      emptyText="No encontramos ese asesor."
                    />
                  )}
                </FormField>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-(--lifeops-fg)">Asesor</span>
                  <p className="flex h-12 items-center rounded-lg bg-(--lifeops-hover)/50 px-3 text-sm text-(--lifeops-muted)">
                    Tú ({profile?.name || 'asesor'})
                  </p>
                </div>
              )}
            </div>
            <FormField label="Proyecto" htmlFor="manual-project" variant="auth" error={fieldErrors.projectName}>
              <Combobox
                id="manual-project"
                value={projectName}
                onChange={setProjectName}
                options={PROJECT_NAME_OPTIONS.map((name) => ({ value: name, label: name }))}
                placeholder="Busca el proyecto o plan…"
              />
            </FormField>
          </FormSection>

          <FormSection title="Cobranza" description="Con la emisión y la forma de pago se arma el calendario de recibos.">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Fecha de emisión" htmlFor="manual-issue-date" variant="auth" error={fieldErrors.issueDate}>
                <DateInput id="manual-issue-date" value={issueDate} max={maxDate} onChange={setIssueDate} required />
              </FormField>
              <FormField
                label="Día de cobro"
                htmlFor="manual-collection-day"
                variant="auth"
                hint="Opcional · 1 a 31"
                error={fieldErrors.collectionDay}
              >
                <Input
                  id="manual-collection-day"
                  inputMode="numeric"
                  value={collectionDay}
                  onChange={(e) => {
                    const day = filterDigits(e.target.value, 2);
                    if (day === '' || Number(day) <= 31) setCollectionDay(day);
                  }}
                  maxLength={2}
                  placeholder="Ej. 15"
                />
              </FormField>
            </div>
            <FormField label="Forma de pago" htmlFor="manual-payment-method" variant="auth" error={fieldErrors.paymentMethod}>
              <Select
                id="manual-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
              >
                <option value="">Elige la forma de pago…</option>
                {PAYMENT_METHOD_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </FormField>
          </FormSection>

          {formError ? (
            <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-(--lifeops-fg)">
              {formError}
            </p>
          ) : null}
        </form>
      </AppDialog>

      {isPromotory && profile?.id ? (
        <InviteConsultantDialog
          open={inviteOpen}
          officeId={profile.id}
          elevated
          onClose={() => setInviteOpen(false)}
          onInvited={async (info) => {
            const list = await reloadConsultants();
            const match =
              list.find(
                (c) =>
                  c.consultant_code?.toLowerCase() ===
                  info.consultantCode.toLowerCase() ||
                  c.email?.toLowerCase() === info.email.toLowerCase(),
              ) ?? null;
            if (match) setConsultantId(match.id);
          }}
        />
      ) : null}
    </>
  );
}
