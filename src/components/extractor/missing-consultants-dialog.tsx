'use client';

import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
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
export function randomEmailForCode(code: string): string {
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
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [error, setError] = useState('');
  const submitting = submitMode != null;

  if (
    editingCode &&
    !consultants.some((c) => c.consultantCode === editingCode)
  ) {
    setEditingCode(null);
  }

  const selected = useMemo(
    () => consultants.filter((c) => c.selected),
    [consultants],
  );
  const allSelected =
    consultants.length > 0 && selected.length === consultants.length;
  const someSelected = selected.length > 0 && !allSelected;

  const updateRow = (index: number, patch: Partial<MissingConsultantDraft>) => {
    onChange(
      consultants.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  };

  const setAllSelected = (value: boolean) => {
    onChange(consultants.map((c) => ({ ...c, selected: value })));
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

  const inviteSelected = async (rows: MissingConsultantDraft[]) => {
    const chosen = rows.filter((c) => c.selected);
    for (const batch of chunkArray(chosen, IMPORT_BATCH_SIZE)) {
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
    for (const c of chosen) {
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
          `${c.consultantCode}: ${inviteData.error || 'no se pudo enviar la invitación'
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

    const rest = rows.filter((c) => !c.selected);
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
        const ready = consultants.map((c) => {
          if (!c.selected || c.email.trim()) return c;
          return { ...c, email: randomEmailForCode(c.consultantCode) };
        });
        const chosen = ready.filter((c) => c.selected);
        const invalid = chosen.filter((c) => !looksLikeEmail(c.email));
        if (invalid.length > 0) {
          throw new Error(
            'Revisa el correo de los asesores marcados. Si lo dejas vacío, usamos uno generado.',
          );
        }
        const seenEmails = new Set<string>();
        for (const row of chosen) {
          const email = row.email.trim().toLowerCase();
          if (seenEmails.has(email)) {
            throw new Error(
              `El correo ${email} está repetido. Cada asesor necesita uno distinto.`,
            );
          }
          seenEmails.add(email);
        }
        if (ready.some((c, index) => c.email !== consultants[index]?.email)) {
          onChange(ready);
        }
        await inviteSelected(ready);
        toast.success(
          chosen.length === 1
            ? 'Asesor listo. Continuamos con la importación.'
            : `${chosen.length} asesores listos. Continuamos con la importación.`,
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
  const selectionLabel =
    selected.length === 0
      ? ''
      : allSelected
        ? `Todos (${consultants.length})`
        : `${selected.length} de ${consultants.length}`;
  const submitLabel =
    submitMode === 'invite'
      ? 'Invitando…'
      : submitMode === 'create'
        ? 'Importando…'
        : selected.length > 0
          ? 'Invitar e importar'
          : 'Importar';

  return (
    <AppDialog
      open={open}
      title="Asesores por registrar"
      description="El correo ya viene listo. Marca a quién invitar; si no marcas a nadie, solo se registran y sigue la importación."
      onClose={() => {
        if (!locked) onClose();
      }}
      busy={locked}
      size="xl"
    >
      <div className="space-y-4">
        <label
          className={cn(
            'flex items-center gap-3 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) px-3 py-2.5',
            locked || consultants.length === 0
              ? 'cursor-not-allowed opacity-60'
              : 'cursor-pointer hover:bg-(--lifeops-hover)/60',
          )}
        >
          <input
            type="checkbox"
            checked={allSelected}
            disabled={locked || consultants.length === 0}
            aria-label="Seleccionar todos"
            ref={(node) => {
              if (node) node.indeterminate = someSelected;
            }}
            onChange={() => setAllSelected(!allSelected)}
            className="h-4 w-4 rounded border-(--lifeops-border) text-[#FBDBAC] focus:ring-[#FBDBAC]"
          />
          <span className="text-sm font-medium text-(--lifeops-fg)">
            Seleccionar todos
          </span>
          <span className="ml-auto text-sm tabular-nums text-(--lifeops-muted)">
            {selectionLabel}
          </span>
        </label>

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
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' && e.key !== 'Tab') return;
                          const backward = e.key === 'Tab' && e.shiftKey;
                          const target = backward ? index - 1 : index + 1;
                          if (target < 0 || target >= consultants.length) {
                            if (e.key === 'Enter') e.preventDefault();
                            return;
                          }
                          e.preventDefault();
                          document
                            .getElementById(`missing-consultant-name-${target}`)
                            ?.focus();
                        }}
                        className="h-10"
                        aria-label={`Nombre de ${c.consultantCode}`}
                      />
                    </td>
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      {editingCode === c.consultantCode ? (
                        <Input
                          id={`missing-consultant-email-${index}`}
                          type="email"
                          value={c.email}
                          disabled={locked}
                          autoFocus
                          maxLength={LIMITS.email}
                          placeholder="correo@ejemplo.com"
                          aria-invalid={
                            c.selected &&
                            c.email.trim().length > 0 &&
                            !looksLikeEmail(c.email)
                          }
                          onChange={(e) =>
                            updateRow(index, { email: e.target.value })
                          }
                          onFocus={(e) => e.currentTarget.select()}
                          onBlur={(e) => {
                            const trimmed = e.currentTarget.value.trim();
                            if (!trimmed) {
                              updateRow(index, {
                                email: randomEmailForCode(c.consultantCode),
                              });
                            } else if (trimmed !== c.email) {
                              updateRow(index, { email: trimmed });
                            }
                            setEditingCode(null);
                          }}
                          className="h-10"
                          aria-label={`Correo de ${c.consultantCode}`}
                        />
                      ) : (
                        <div className="flex min-w-0 items-center gap-1">
                          <button
                            type="button"
                            disabled={locked}
                            className="min-w-0 flex-1 truncate text-left font-mono text-sm text-(--lifeops-fg) hover:underline disabled:cursor-not-allowed disabled:no-underline"
                            aria-label={`Editar correo de ${c.consultantCode}`}
                            onClick={() => setEditingCode(c.consultantCode)}
                          >
                            {c.email}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            disabled={locked}
                            aria-label={`Cambiar correo de ${c.consultantCode}`}
                            onClick={() => setEditingCode(c.consultantCode)}
                          >
                            <X aria-hidden />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-xs text-(--lifeops-muted)">
          Pulsa el correo para cambiarlo. En el nombre, Enter o Tab pasa al
          siguiente asesor.
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
            variant="brand"
            size="lg"
            disabled={locked || consultants.length === 0}
            onClick={() => void run(selected.length > 0 ? 'invite' : 'create')}
          >
            {submitLabel}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
