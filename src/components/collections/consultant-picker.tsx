'use client';

import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type ConsultantPickerItem = { id: string; name: string; count: number; atRisk: number };

/** Asesor filter for Cobranza: a list on wide screens, a select on small ones. Counts follow the period filter. */
export function ConsultantPicker({
  items,
  value,
  onChange,
  total,
}: {
  items: ConsultantPickerItem[];
  value: string | null;
  onChange: (id: string | null) => void;
  total: number;
}) {
  const options = [{ id: null, name: 'Todos los asesores', count: total, atRisk: 0 }, ...items];
  return (
    <>
      <div className="xl:hidden">
        <label htmlFor="collections-consultant" className="sr-only">
          Asesor
        </label>
        <Select
          id="collections-consultant"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
        >
          {options.map((o) => (
            <option key={o.id ?? 'all'} value={o.id ?? ''}>
              {o.name} · {o.count}
            </option>
          ))}
        </Select>
      </div>

      <nav
        aria-label="Asesores"
        className="hidden overflow-hidden rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) xl:block"
      >
        <h2 className="border-b border-(--lifeops-border) px-4 py-3 text-[15px] font-semibold text-(--lifeops-fg)">
          Asesores
        </h2>
        <ul className="max-h-[36rem] divide-y divide-(--lifeops-border) overflow-y-auto">
          {options.map((o) => {
            const active = o.id === value;
            return (
              <li key={o.id ?? 'all'}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(o.id)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm hover:bg-(--lifeops-hover) focus-visible:bg-(--lifeops-hover) focus-visible:outline-none',
                    active && 'bg-(--lifeops-hover) shadow-[inset_3px_0_0_var(--lifeops-accent)]',
                  )}
                >
                  <span className="min-w-0">
                    <span className={cn('block truncate', active ? 'font-medium text-(--lifeops-accent)' : 'text-(--lifeops-fg)')}>
                      {o.name}
                    </span>
                    <span className="block text-xs text-(--lifeops-muted)">
                      {o.count === 1 ? '1 recibo' : `${o.count} recibos`}
                      {o.atRisk > 0 ? ` · ${o.atRisk} en peligro` : ''}
                    </span>
                  </span>
                  {o.atRisk > 0 ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-(--viz-at-risk)" aria-hidden />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
