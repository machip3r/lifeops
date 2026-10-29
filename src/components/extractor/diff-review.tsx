'use client';

import { useMemo, useState } from 'react';
import { ArrowRight, Check, FileSpreadsheet, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/filter-chips';
import { Input } from '@/components/ui/input';
import { filterEntityName } from '@/lib/validation/input-filters';
import { LIMITS } from '@/lib/validation/schemas';
import { cn } from '@/lib/utils';

export type DiffReviewItem = {
  /** Póliza number (also the key of `picks`) */
  key: string;
  subtitle?: string;
  diffs: Array<{ field: string; label: string; current: string; incoming: string }>;
};

type Filter = 'all' | 'pending' | 'picked';

/** Empty LifeOps fields the file completes on its own (no decision needed). */
export function FilledFieldsSummary({ items }: { items: Array<{ key: string; fills: Array<{ label: string; incoming: string }> }> }) {
  if (items.length === 0) return null;
  return (
    <details className="group rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3 text-sm sm:px-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-(--lifeops-fg)">
        <Sparkles className="h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden />
        <span>
          Se completarán datos vacíos en {items.length.toLocaleString('es-MX')} {items.length === 1 ? 'póliza' : 'pólizas'}{' '}
          <span className="text-(--lifeops-muted)">(automático)</span>
        </span>
        <span className="ml-auto text-xs text-(--lifeops-accent) group-open:hidden">Ver detalle</span>
        <span className="ml-auto hidden text-xs text-(--lifeops-accent) group-open:inline">Ocultar</span>
      </summary>
      <ul className="mt-3 max-h-56 space-y-1.5 overflow-y-auto text-xs text-(--lifeops-muted)">
        {items.slice(0, 200).map((i) => (
          <li key={i.key}>
            <span className="font-mono text-(--lifeops-fg)">{i.key}</span>: {i.fills.map((f) => `${f.label} ${f.incoming}`).join(' · ')}
          </li>
        ))}
        {items.length > 200 ? <li>… y {(items.length - 200).toLocaleString('es-MX')} más</li> : null}
      </ul>
    </details>
  );
}

const PAGE = 20;

const normalize = (v: string) =>
  v
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

/** One value to choose (LifeOps or archivo) of a differing field. */
function ValueChoice({
  source,
  value,
  selected,
  onSelect,
}: {
  source: 'lifeops' | 'file';
  value: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = source === 'lifeops' ? ShieldCheck : FileSpreadsheet;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]',
        selected
          ? 'border-(--lifeops-accent) bg-(--lifeops-hover) shadow-[inset_0_0_0_1px_var(--lifeops-accent)]'
          : 'border-(--lifeops-field-border) bg-(--lifeops-field) hover:border-(--lifeops-field-border-hover) hover:bg-(--lifeops-hover)/40',
      )}
    >
      <span
        className={cn(
          'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
          selected ? 'border-(--lifeops-accent) bg-(--lifeops-accent) text-(--lifeops-on-accent)' : 'border-(--lifeops-field-border-hover)',
        )}
        aria-hidden
      >
        {selected ? <Check className="h-2.5 w-2.5" strokeWidth={3.5} /> : null}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-(--lifeops-muted)">
          <Icon className="h-3 w-3" aria-hidden />
          {source === 'lifeops' ? 'En LifeOps' : 'En el archivo'}
        </span>
        <span
          className={cn(
            'block break-words text-[13px]',
            selected ? 'font-medium text-(--lifeops-fg)' : 'text-(--lifeops-muted)',
          )}
        >
          {value || '—'}
        </span>
      </span>
    </button>
  );
}

/**
 * "Datos distintos a LifeOps": per póliza and field, pick LifeOps or the file value.
 * Nothing is picked by default (keep LifeOps); `picks` = fields to overwrite per póliza.
 * Bulk: everything, per field (all pólizas) or per póliza.
 */
export function DiffReview({
  items,
  picks,
  onChange,
  description = 'Por defecto se conserva lo que ya tienes. Elige el valor del archivo solo donde quieras actualizar.',
}: {
  items: DiffReviewItem[];
  picks: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  description?: string;
}) {
  const [shown, setShown] = useState(PAGE);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const totalDiffs = useMemo(() => items.reduce((n, i) => n + i.diffs.length, 0), [items]);
  const pickedCount = items.reduce((n, i) => n + (picks[i.key]?.length ?? 0), 0);

  /** Fields that differ, with how many pólizas have them (most common first). */
  const fields = useMemo(() => {
    const byField = new Map<string, { field: string; label: string; count: number }>();
    for (const item of items) {
      for (const d of item.diffs) {
        const entry = byField.get(d.field) ?? { field: d.field, label: d.label, count: 0 };
        entry.count += 1;
        byField.set(d.field, entry);
      }
    }
    return [...byField.values()].sort((a, b) => b.count - a.count);
  }, [items]);

  const visible = useMemo(() => {
    const q = normalize(query);
    return items.filter((item) => {
      const picked = picks[item.key]?.length ?? 0;
      if (filter === 'pending' && picked > 0) return false;
      if (filter === 'picked' && picked === 0) return false;
      return !q || normalize(item.key).includes(q) || normalize(item.subtitle ?? '').includes(q);
    });
  }, [items, picks, filter, query]);

  if (items.length === 0) return null;

  const setItem = (key: string, fields: string[]) => onChange({ ...picks, [key]: fields });
  const fieldAllPicked = (field: string) =>
    items.every((i) => !i.diffs.some((d) => d.field === field) || picks[i.key]?.includes(field));
  const setField = (field: string, on: boolean) =>
    onChange(
      Object.fromEntries(
        items.map((i) => {
          const current = new Set(picks[i.key] ?? []);
          if (i.diffs.some((d) => d.field === field)) {
            if (on) current.add(field);
            else current.delete(field);
          }
          return [i.key, [...current]];
        }),
      ),
    );

  const pickedPolizas = items.filter((i) => (picks[i.key]?.length ?? 0) > 0).length;

  return (
    <section className="overflow-hidden rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="space-y-4 border-b border-(--lifeops-border) px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-semibold text-(--lifeops-fg)">
              Datos distintos a LifeOps{' '}
              <span className="font-normal text-(--lifeops-muted)">
                · {items.length.toLocaleString('es-MX')} {items.length === 1 ? 'póliza' : 'pólizas'}
              </span>
            </h3>
            <p className="mt-0.5 max-w-2xl text-xs text-(--lifeops-muted)">{description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pickedCount === totalDiffs}
              onClick={() => onChange(Object.fromEntries(items.map((i) => [i.key, i.diffs.map((d) => d.field)])))}
            >
              Usar el archivo en todo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({})} disabled={pickedCount === 0}>
              Conservar todo
            </Button>
          </div>
        </div>

        {/* Live summary: how much of the file will be used */}
        <div className="flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--lifeops-hover)" aria-hidden>
            <div
              className="h-full rounded-full bg-[#FBDBAC] transition-[width] duration-300"
              style={{ width: `${totalDiffs ? (pickedCount / totalDiffs) * 100 : 0}%` }}
            />
          </div>
          <p className="shrink-0 text-xs tabular-nums text-(--lifeops-muted)" aria-live="polite">
            <span className="font-medium text-(--lifeops-fg)">{pickedCount.toLocaleString('es-MX')}</span> de{' '}
            {totalDiffs.toLocaleString('es-MX')} datos se actualizarán
          </p>
        </div>

        {fields.length > 1 ? (
          <div>
            <p className="mb-1.5 text-xs font-medium text-(--lifeops-muted)">Usar el archivo por dato, en todas las pólizas</p>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Usar el archivo por dato">
              {fields.map((f) => {
                const on = fieldAllPicked(f.field);
                return (
                  <button
                    key={f.field}
                    type="button"
                    aria-pressed={on}
                    onClick={() => setField(f.field, !on)}
                    className={cn(
                      'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]',
                      on
                        ? 'border-(--lifeops-accent) bg-(--lifeops-hover) font-medium text-(--lifeops-fg)'
                        : 'border-(--lifeops-border) text-(--lifeops-muted) hover:bg-(--lifeops-hover)/60 hover:text-(--lifeops-fg)',
                    )}
                  >
                    {on ? <Check className="h-3.5 w-3.5 text-(--lifeops-accent)" aria-hidden /> : null}
                    {f.label}
                    <span className="tabular-nums text-(--lifeops-muted)">{f.count.toLocaleString('es-MX')}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {items.length > 5 ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(filterEntityName(e.target.value))}
              maxLength={LIMITS.search}
              placeholder="Buscar póliza o cliente"
              aria-label="Buscar póliza o cliente"
              className="h-10 sm:max-w-xs"
            />
            <FilterChips
              label="Filtrar pólizas"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'Todas', count: items.length },
                { value: 'pending', label: 'Se conserva LifeOps', count: items.length - pickedPolizas },
                { value: 'picked', label: 'Con datos del archivo', count: pickedPolizas },
              ]}
            />
          </div>
        ) : null}
      </header>

      {visible.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-(--lifeops-muted) sm:px-5">Ninguna póliza coincide con la búsqueda.</p>
      ) : (
        <ul className="divide-y divide-(--lifeops-border)">
          {visible.slice(0, shown).map((item) => {
            const chosen = new Set(picks[item.key] ?? []);
            const allOn = item.diffs.every((d) => chosen.has(d.field));
            return (
              <li key={item.key} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-mono font-semibold text-(--lifeops-accent)">{item.key}</span>
                      {item.subtitle ? <span className="text-(--lifeops-fg)"> · {item.subtitle}</span> : null}
                    </p>
                    <p className="text-xs text-(--lifeops-muted)">
                      {chosen.size === 0
                        ? `${item.diffs.length} ${item.diffs.length === 1 ? 'dato distinto' : 'datos distintos'} · se conserva LifeOps`
                        : `${chosen.size} de ${item.diffs.length} con el archivo`}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={chosen.size === 0}
                      onClick={() => setItem(item.key, [])}
                      aria-label={`Conservar LifeOps en la póliza ${item.key}`}
                    >
                      Conservar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      disabled={allOn}
                      onClick={() => setItem(item.key, item.diffs.map((d) => d.field))}
                      aria-label={`Usar el archivo en la póliza ${item.key}`}
                    >
                      Usar archivo
                    </Button>
                  </div>
                </div>

                <div className="mt-3 space-y-2.5">
                  {item.diffs.map((diff) => {
                    const on = chosen.has(diff.field);
                    const pick = (useFile: boolean) => {
                      const next = new Set(chosen);
                      if (useFile) next.add(diff.field);
                      else next.delete(diff.field);
                      setItem(item.key, [...next]);
                    };
                    return (
                      <div key={diff.field} className="grid gap-1.5 sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:items-center sm:gap-3">
                        <p className="text-xs font-medium text-(--lifeops-muted)">{diff.label}</p>
                        <div
                          role="radiogroup"
                          aria-label={`${diff.label} de la póliza ${item.key}`}
                          className="flex flex-col gap-1.5 sm:flex-row sm:items-stretch"
                        >
                          <ValueChoice source="lifeops" value={diff.current} selected={!on} onSelect={() => pick(false)} />
                          <ArrowRight className="hidden h-4 w-4 shrink-0 self-center text-(--lifeops-muted) sm:block" aria-hidden />
                          <ValueChoice source="file" value={diff.incoming} selected={on} onSelect={() => pick(true)} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {visible.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full cursor-pointer border-t border-(--lifeops-border) px-4 py-3 text-center text-sm text-(--lifeops-accent) hover:bg-(--lifeops-hover)"
        >
          Ver {Math.min(PAGE, visible.length - shown)} más ({(visible.length - shown).toLocaleString('es-MX')} restantes)
        </button>
      ) : null}
    </section>
  );
}
