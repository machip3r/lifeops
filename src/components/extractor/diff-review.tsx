'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DiffReviewItem = {
  /** Póliza number (also the key of `picks`) */
  key: string;
  subtitle?: string;
  diffs: Array<{ field: string; label: string; current: string; incoming: string }>;
};

const PAGE = 25;

/**
 * "Datos distintos a LifeOps": per póliza, LifeOps vs file values with a checkbox per field.
 * Nothing is checked by default (keep LifeOps); `picks` = fields to overwrite per póliza.
 */
export function DiffReview({
  items,
  picks,
  onChange,
  description = 'Por defecto se conserva lo que ya tienes. Marca lo que quieras actualizar con el archivo.',
}: {
  items: DiffReviewItem[];
  picks: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
  description?: string;
}) {
  const [shown, setShown] = useState(PAGE);
  const pickedCount = Object.values(picks).reduce((n, fields) => n + fields.length, 0);
  if (items.length === 0) return null;

  const setItem = (key: string, fields: string[]) => onChange({ ...picks, [key]: fields });

  return (
    <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-(--lifeops-border) px-4 py-3 sm:px-5">
        <div>
          <h3 className="text-[15px] font-semibold text-(--lifeops-fg)">
            Datos distintos a LifeOps <span className="font-normal text-(--lifeops-muted)">· {items.length} pólizas</span>
          </h3>
          <p className="mt-0.5 text-xs text-(--lifeops-muted)">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(Object.fromEntries(items.map((i) => [i.key, i.diffs.map((d) => d.field)])))}
          >
            Usar el archivo en todo
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange({})} disabled={pickedCount === 0}>
            Conservar todo
          </Button>
        </div>
      </header>
      <ul className="divide-y divide-(--lifeops-border)">
        {items.slice(0, shown).map((item) => {
          const chosen = new Set(picks[item.key] ?? []);
          const allOn = item.diffs.every((d) => chosen.has(d.field));
          return (
            <li key={item.key} className="px-4 py-3 sm:px-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-mono font-medium text-(--lifeops-accent)">{item.key}</span>
                  {item.subtitle ? <span className="text-(--lifeops-muted)"> · {item.subtitle}</span> : null}
                </p>
                <label className="flex cursor-pointer items-center gap-2 text-xs text-(--lifeops-muted)">
                  <input
                    type="checkbox"
                    checked={allOn}
                    onChange={(e) => setItem(item.key, e.target.checked ? item.diffs.map((d) => d.field) : [])}
                    className="h-4 w-4 accent-[#FBDBAC]"
                  />
                  Usar el archivo en esta póliza
                </label>
              </div>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wide text-(--lifeops-muted)">
                      <th className="py-1 pr-3 font-medium">Dato</th>
                      <th className="py-1 pr-3 font-medium">En LifeOps</th>
                      <th className="py-1 pr-3 font-medium">En el archivo</th>
                      <th className="w-24 py-1 text-right font-medium">Actualizar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.diffs.map((diff) => {
                      const on = chosen.has(diff.field);
                      return (
                        <tr key={diff.field} className="border-t border-(--lifeops-border)">
                          <td className="py-1.5 pr-3 text-(--lifeops-muted)">{diff.label}</td>
                          <td className={cn('py-1.5 pr-3', on ? 'text-(--lifeops-muted) line-through' : 'text-(--lifeops-fg)')}>
                            {diff.current}
                          </td>
                          <td className={cn('py-1.5 pr-3', on ? 'font-medium text-(--lifeops-fg)' : 'text-(--lifeops-muted)')}>
                            {diff.incoming}
                          </td>
                          <td className="py-1.5 text-right">
                            <input
                              type="checkbox"
                              aria-label={`Actualizar ${diff.label} de ${item.key} con el archivo`}
                              checked={on}
                              onChange={(e) => {
                                const next = new Set(chosen);
                                if (e.target.checked) next.add(diff.field);
                                else next.delete(diff.field);
                                setItem(item.key, [...next]);
                              }}
                              className="h-4 w-4 accent-[#FBDBAC]"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > shown ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + PAGE)}
          className="w-full border-t border-(--lifeops-border) px-4 py-2.5 text-center text-sm text-(--lifeops-accent) hover:bg-(--lifeops-hover)"
        >
          Ver {Math.min(PAGE, items.length - shown)} más ({items.length - shown} restantes)
        </button>
      ) : null}
    </section>
  );
}
