'use client';

import { useMemo, useState } from 'react';
import { Mail, Users } from 'lucide-react';
import { authFetch } from '@/lib/api-client';
import { useToast } from '@/components/toast';
import { AppDialog } from '@/components/ui/app-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LIMITS } from '@/lib/validation/schemas';
import { IMPORT_BATCH_SIZE, chunkArray } from '@/lib/extractor/batch';
import { cn } from '@/lib/utils';

export type MissingConsultantDraft = {
  consultantCode: string;
  name: string;
  email: string;
  /** Selected to receive invitation when inviting. */
  selected: boolean;
};

type Props = {
  open: boolean;
  officeId: string;
  consultants: MissingConsultantDraft[];
  onChange: (next: MissingConsultantDraft[]) => void;
  onClose: () => void;
  /** After rows exist (and optional invites), continue the import. */
  onDone: () => void | Promise<void>;
  busy?: boolean;
};

function randomTempPassword(): string {
  const base = Math.random().toString(36).slice(2, 10);
  return `Tmp.${base}9!`;
}

/** Valid-looking placeholder correo for bulk fill. */
function randomEmailForCode(code: string): string {
  const slug =
    code
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 20) || 'asesor';
  const rand = Math.random().toString(36).slice(2, 8);
  return `${slug}.${rand}@lifeops.com`;
}

function looksLikeEmail(value: string): boolean {
  const t = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

/**
 * Manual import path: create asesor rows, optionally invite with correo.
 * No password field — invite uses a temporary server password.
 */
export function MissingConsultantsDialog({
  open,
  officeId,
  consultants,
  onChange,
  onClose,
  onDone,
  busy = false,
}: Props) {
  const { toast } = useToast();
  const [submitMode, setSubmitMode] = useState<'create' | 'invite' | null>(
    null,
  );
  const [autoEmail, setAutoEmail] = useState(false);
  const [error, setError] = useState('');
  const submitting = submitMode != null;

  const selected = useMemo(
    () => consultants.filter((c) => c.selected),
    [consultants],
  );
  const selectedReady =
    selected.length > 0 &&
    selected.every((c) => looksLikeEmail(c.email));
  const allSelected = consultants.length > 0 && selected.length === consultants.length;

  const updateRow = (index: number, patch: Partial<MissingConsultantDraft>) => {
    onChange(
      consultants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const setAllSelected = (value: boolean) => {
    onChange(consultants.map((c) => ({ ...c, selected: value })));
  };

  const applyAutoEmails = (enabled: boolean) => {
    setAutoEmail(enabled);
    if (!enabled) return;
    onChange(
      consultants.map((c) => ({
        ...c,
        selected: true,
        email: randomEmailForCode(c.consultantCode),
      })),
    );
  };

  const createRowsOnly = async () => {
    for (const batch of chunkArray(consultants, IMPORT_BATCH_SIZE)) {
      const res = await authFetch('/api/extractor/create-consultants', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'auto',
          officeId,
          consultants: batch.map((c) => ({
            code: c.consultantCode,
            name: c.name || c.consultantCode,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron crear los asesores.');
      }
      if (Array.isArray(data.results)) {
        const failed = (
          data.results as Array<{ code: string; error?: string }>
        ).filter((r) => r.error);
        if (failed.length > 0) {
          throw new Error(
            failed
              .slice(0, 3)
              .map((r) => `${r.code}: ${r.error}`)
              .join(' · '),
          );
        }
      }
    }
  };

  const inviteSelected = async () => {
    for (const batch of chunkArray(selected, IMPORT_BATCH_SIZE)) {
      const createRes = await authFetch('/api/extractor/create-consultants', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'manual',
          officeId,
          consultants: batch.map((c) => ({
            consultantCode: c.consultantCode,
            name: c.name || c.consultantCode,
            email: c.email.trim().toLowerCase(),
            password: randomTempPassword(),
          })),
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(
          createData.error || 'No se pudieron registrar los asesores seleccionados.',
        );
      }
    }

    const inviteErrors: string[] = [];
    for (const c of selected) {
      const email = c.email.trim().toLowerCase();
      const inviteRes = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId,
          consultantEmail: email,
          consultantName: c.name || c.consultantCode,
          consultantCode: c.consultantCode,
        }),
      });
      const inviteData = await inviteRes.json().catch(() => ({}));
      if (!inviteRes.ok) {
        inviteErrors.push(
          `${c.consultantCode}: ${
            inviteData.error || 'no se pudo enviar la invitación'
          }`,
        );
      }
    }
    if (inviteErrors.length > 0) {
      // Rows exist; allow import to continue (same as invite from Asesores).
      toast.error(
        `Asesores registrados, pero falló el correo: ${inviteErrors
          .slice(0, 3)
          .join(' · ')}`,
      );
    }

    const rest = consultants.filter((c) => !c.selected);
    if (rest.length > 0) {
      for (const batch of chunkArray(rest, IMPORT_BATCH_SIZE)) {
        const res = await authFetch('/api/extractor/create-consultants', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'auto',
            officeId,
            consultants: batch.map((c) => ({
              code: c.consultantCode,
              name: c.name || c.consultantCode,
            })),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'No se pudieron crear el resto de asesores.');
        }
      }
    }
  };

  const run = async (mode: 'create' | 'invite') => {
    setError('');
    setSubmitMode(mode);
    try {
      if (mode === 'invite') {
        if (!selectedReady) {
          throw new Error(
            'Selecciona al menos un asesor y completa un correo válido en cada uno.',
          );
        }
        await inviteSelected();
        toast.success(
          selected.length === 1
            ? 'Asesor listo. Continuamos con la importación.'
            : `${selected.length} asesores listos. Continuamos con la importación.`,
        );
      } else {
        await createRowsOnly();
        toast.success(
          'Asesores registrados. Puedes invitarlos después desde Asesores.',
        );
      }
      await onDone();
    } catch (e) {
      console.error(e);
      const message =
        e instanceof Error ? e.message : 'No se pudieron procesar los asesores.';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitMode(null);
    }
  };

  const locked = busy || submitting;

  return (
    <AppDialog
      open={open}
      title="Asesores faltantes"
      description="Regístralos para continuar la importación. La invitación por correo es opcional."
      onClose={() => {
        if (!locked) onClose();
      }}
      busy={locked}
      size="xl"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            size="sm"
            variant={allSelected ? 'brand' : 'outline'}
            disabled={locked || consultants.length === 0}
            aria-pressed={allSelected}
            onClick={() => setAllSelected(!allSelected)}
            className="w-full justify-center gap-1.5"
          >
            <Users className="h-3.5 w-3.5" aria-hidden />
            {allSelected ? 'Todos seleccionados' : 'Seleccionar todos para invitar'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant={autoEmail ? 'brand' : 'outline'}
            disabled={locked || consultants.length === 0}
            aria-pressed={autoEmail}
            onClick={() => applyAutoEmails(!autoEmail)}
            className="w-full justify-center gap-1.5"
          >
            <Mail className="h-3.5 w-3.5" aria-hidden />
            {autoEmail ? 'Correos aleatorios asignados' : 'Asignar correos aleatorios'}
          </Button>
        </div>

        <div className="overflow-hidden rounded-lg border border-(--lifeops-border)">
          <div className="max-h-[50vh] overflow-y-auto">
            <table className="min-w-full divide-y divide-(--lifeops-border)">
              <thead className="sticky top-0 bg-(--lifeops-hover)">
                <tr>
                  <th className="w-10 px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                    Invitar
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                    Código
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                    Nombre
                  </th>
                  <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                    Correo
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-(--lifeops-border)">
                {consultants.map((c, index) => (
                  <tr
                    key={c.consultantCode}
                    className={cn(
                      'bg-(--lifeops-page) transition-colors',
                      locked
                        ? 'cursor-default'
                        : 'cursor-pointer hover:bg-(--lifeops-hover)/60',
                      c.selected && 'bg-[#FBDBAC]/10',
                    )}
                    onClick={() => {
                      if (!locked) {
                        updateRow(index, { selected: !c.selected });
                      }
                    }}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        disabled={locked}
                        aria-label={`Invitar a ${c.consultantCode}`}
                        onChange={(e) =>
                          updateRow(index, { selected: e.target.checked })
                        }
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-(--lifeops-border) text-[#FBDBAC] focus:ring-[#FBDBAC]"
                      />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-sm font-medium text-(--lifeops-accent)">
                      {c.consultantCode}
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        id={`missing-consultant-name-${index}`}
                        value={c.name}
                        disabled={locked}
                        maxLength={LIMITS.personName}
                        onChange={(e) => updateRow(index, { name: e.target.value })}
                        className="h-10"
                        aria-label={`Nombre de ${c.consultantCode}`}
                      />
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Input
                        id={`missing-consultant-email-${index}`}
                        type="email"
                        value={c.email}
                        disabled={locked}
                        maxLength={LIMITS.email}
                        placeholder="correo@ejemplo.com"
                        onChange={(e) => {
                          setAutoEmail(false);
                          updateRow(index, { email: e.target.value });
                        }}
                        className={cn(
                          'h-10',
                          c.selected &&
                            !looksLikeEmail(c.email) &&
                            'border-amber-500/60',
                        )}
                        aria-label={`Correo de ${c.consultantCode}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-(--lifeops-muted)">
          Sin invitar: solo se crea el asesor y puedes mandar el enlace después desde
          Asesores. Con invitar: se envía el correo a los seleccionados que tengan correo.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={locked}
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={locked || consultants.length === 0}
            onClick={() => void run('create')}
          >
            {submitMode === 'create'
              ? 'Registrando…'
              : 'Solo registrar e importar'}
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={locked || !selectedReady}
            onClick={() => void run('invite')}
          >
            {submitMode === 'invite'
              ? 'Invitando…'
              : selected.length > 0
                ? `Invitar (${selected.length}) e importar`
                : 'Invitar e importar'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
