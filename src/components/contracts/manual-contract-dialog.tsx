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
import { PAYMENT_METHOD_OPTIONS } from '@/lib/contracts/payment-methods';
import { PROJECT_NAME_OPTIONS } from '@/lib/contracts/project-names';
import { db } from '@/lib/db';
import type { Client, Consultant } from '@/lib/supabase';
import { LIMITS } from '@/lib/validation/schemas';

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const selectClass =
  'h-9 w-full rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-chrome) px-3 text-sm text-(--lifeops-fg) shadow-xs outline-none focus-visible:border-(--lifeops-accent) focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/30';

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
  const [lastPaymentDate, setLastPaymentDate] = useState('');
  const [projectName, setProjectName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');

  const isPromotory = profile?.role === 'promotory';
  const maxDate = todayIsoDate();

  const sortedClients = useMemo(
    () =>
      [...clients].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }),
      ),
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
    setLastPaymentDate('');
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
    Boolean(collectionDay) &&
    Boolean(lastPaymentDate) &&
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
        collectionDay: Number(collectionDay),
        lastPaymentDate: lastPaymentDate.trim(),
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

  return (
    <>
      <AppDialog
        open={open}
        title="Registrar póliza"
        description="Alta manual con los datos mínimos para cobranza y recordatorios."
        onClose={handleClose}
        busy={submitting}
        size="lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          {loadingLists && (
            <p className="text-sm text-[#9ca3af]">Cargando catálogos…</p>
          )}

          {isPromotory ? (
            <div className="flex flex-wrap items-end gap-3">
              <FormField
                label="Asesor"
                htmlFor="manual-consultant"
                variant="auth"
                error={fieldErrors.consultantId}
                className="flex-1 min-w-[220px]"
              >
                <select
                  id="manual-consultant"
                  className={selectClass}
                  value={consultantId}
                  onChange={(e) => setConsultantId(e.target.value)}
                  required
                >
                  <option value="">Selecciona un asesor…</option>
                  {consultants.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.consultant_code || '—') + ' · ' + (c.name || 'Sin nombre')}
                    </option>
                  ))}
                </select>
              </FormField>
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setInviteOpen(true)}
              >
                Invitar asesor
              </Button>
            </div>
          ) : (
            <p className="text-sm text-(--lifeops-muted)">La póliza quedará a tu nombre.</p>
          )}

          <FormField
            label="Número de póliza"
            htmlFor="manual-contract-number"
            variant="auth"
            error={fieldErrors.contractNumber}
          >
            <Input
              id="manual-contract-number"
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              maxLength={LIMITS.contractNumber}
              required
              placeholder="VI0001566370, GM0000682574…"

            />
          </FormField>

          <section className="space-y-4 rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-hover) p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-(--lifeops-fg)">Cliente</h3>
              <div className="inline-flex rounded-lg border-2 border-(--lifeops-border) bg-(--lifeops-chrome) p-0.5">
                <button
                  type="button"
                  onClick={() => switchClientMode('existing')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${clientMode === 'existing'
                      ? 'bg-[#FBDBAC] text-[#1a1d24]'
                      : 'text-(--lifeops-muted) hover:text-(--lifeops-fg)'
                    }`}
                >
                  Existente
                </button>
                <button
                  type="button"
                  onClick={() => switchClientMode('new')}
                  className={`cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${clientMode === 'new'
                      ? 'bg-[#FBDBAC] text-[#1a1d24]'
                      : 'text-(--lifeops-muted) hover:text-(--lifeops-fg)'
                    }`}
                >
                  Nuevo
                </button>
              </div>
            </div>

            {clientMode === 'existing' ? (
              <FormField
                label="Selecciona el cliente"
                htmlFor="manual-client-select"
                variant="auth"
                error={fieldErrors.clientId}
              >
                <select
                  id="manual-client-select"
                  className={selectClass}
                  value={clientId}
                  onChange={(e) => handleClientSelect(e.target.value)}
                  required
                >
                  <option value="">Elige un cliente…</option>
                  {sortedClients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormField>
            ) : (
              <div className="space-y-4">
                <FormField
                  label="Nombre del cliente"
                  htmlFor="manual-client-name"
                  variant="auth"
                  error={fieldErrors.clientName}
                >
                  <Input
                    id="manual-client-name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    maxLength={LIMITS.personName}
                    required
                    placeholder="Nombre completo"

                  />
                </FormField>
                <FormField
                  label="Fecha de nacimiento"
                  htmlFor="manual-birth-date"
                  variant="auth"
                  hint="Opcional"
                  error={fieldErrors.birthDate}
                >
                  <Input
                    id="manual-birth-date"
                    type="date"
                    value={birthDate}
                    max={maxDate}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next && next > maxDate) return;
                      setBirthDate(next);
                    }}
                    className="block w-full min-w-0"
                  />
                </FormField>
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    label="CURP"
                    htmlFor="manual-client-curp"
                    variant="auth"
                    hint="Opcional"
                    error={fieldErrors.curp}
                  >
                    <Input
                      id="manual-client-curp"
                      value={clientCurp}
                      onChange={(e) => setClientCurp(e.target.value.toUpperCase())}
                      maxLength={18}
                      autoCapitalize="characters"
                      placeholder="XXXX000000XXXXXX00"
                      className="uppercase"
                    />
                  </FormField>
                  <FormField
                    label="RFC"
                    htmlFor="manual-client-rfc"
                    variant="auth"
                    hint="Opcional"
                    error={fieldErrors.rfc}
                  >
                    <Input
                      id="manual-client-rfc"
                      value={clientRfc}
                      onChange={(e) => setClientRfc(e.target.value.toUpperCase())}
                      maxLength={13}
                      autoCapitalize="characters"
                      placeholder="XXXX000000XXX"
                      className="uppercase"
                    />
                  </FormField>
                </div>
              </div>
            )}
          </section>

          <div className="grid gap-4 sm:grid-cols-2 items-start">
            <FormField
              label="Fecha de emisión"
              htmlFor="manual-issue-date"
              variant="auth"
              error={fieldErrors.issueDate}
            >
              <Input
                id="manual-issue-date"
                type="date"
                value={issueDate}
                max={maxDate}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next && next > maxDate) return;
                  setIssueDate(next);
                }}
                required
                className="block w-full min-w-0"
              />
            </FormField>

            <FormField
              label="Día de cobro"
              htmlFor="manual-collection-day"
              variant="auth"
              error={fieldErrors.collectionDay}
            >
              <Input
                id="manual-collection-day"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={collectionDay}
                onChange={(e) => setCollectionDay(e.target.value)}
                required
                placeholder="1–31"

              />
            </FormField>
          </div>

          <FormField
            label="Fecha del último cobro"
            htmlFor="manual-last-payment"
            variant="auth"
            hint="Obligatoria para recordatorios y cobranza"
            error={fieldErrors.lastPaymentDate}
          >
            <Input
              id="manual-last-payment"
              type="date"
              value={lastPaymentDate}
              max={maxDate}
              onChange={(e) => {
                const next = e.target.value;
                if (next && next > maxDate) return;
                setLastPaymentDate(next);
              }}
              required
              className="block w-full min-w-0"
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2 items-start">
            <FormField
              label="Proyecto"
              htmlFor="manual-project"
              variant="auth"
              error={fieldErrors.projectName}
            >
              <select
                id="manual-project"
                className={selectClass}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                required
              >
                <option value="">Selecciona…</option>
                {PROJECT_NAME_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FormField>

            <FormField
              label="Forma de pago o cobro"
              htmlFor="manual-payment-method"
              variant="auth"
              error={fieldErrors.paymentMethod}
            >
              <select
                id="manual-payment-method"
                className={selectClass}
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                required
              >
                <option value="">Selecciona…</option>
                {PAYMENT_METHOD_OPTIONS.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-red-800 bg-red-900/20 p-3 text-sm text-red-200"
            >
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
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
              disabled={submitting || !canSubmit || loadingLists}
            >
              {submitting ? 'Guardando…' : 'Registrar póliza'}
            </Button>
          </div>
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
