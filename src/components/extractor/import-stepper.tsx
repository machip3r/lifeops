'use client';

import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ImportStep = { label: string; icon: LucideIcon };

/**
 * Step tiles of Importar (commissions and Mina de Oro / plantilla). `current` is 1-based;
 * `complete` marks every step done (result screen). Earlier steps are clickable with `onSelect`.
 */
export function ImportStepper({
  steps,
  current,
  complete = false,
  onSelect,
}: {
  steps: ImportStep[];
  current: number;
  complete?: boolean;
  onSelect?: (step: number) => void;
}) {
  return (
    <nav aria-label="Pasos de importación" className="mb-6">
      <ol className="grid gap-2" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
        {steps.map((s, index) => {
          const id = index + 1;
          const done = complete || id < current;
          const active = !complete && id === current;
          const clickable = onSelect != null && !complete && id < current;
          const Icon = done ? Check : s.icon;
          return (
            <li key={s.label} aria-current={active ? 'step' : undefined}>
              <button
                type="button"
                onClick={() => clickable && onSelect(id)}
                disabled={!clickable && !active}
                tabIndex={clickable ? undefined : -1}
                className={cn(
                  'flex w-full flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors sm:px-3',
                  active
                    ? 'cursor-default border-[#FBDBAC] bg-[#FBDBAC]/15 text-(--lifeops-fg)'
                    : done
                      ? cn('border-(--lifeops-border) bg-(--lifeops-hover) text-(--lifeops-fg)', clickable ? 'cursor-pointer hover:border-(--lifeops-accent)/60' : 'cursor-default')
                      : 'cursor-default border-(--lifeops-border) text-(--lifeops-muted) opacity-70',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full',
                    done ? 'bg-(--lifeops-accent) text-(--lifeops-on-accent)' : active ? 'text-(--lifeops-accent)' : 'text-(--lifeops-muted)',
                  )}
                >
                  <Icon className={done ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={done ? 2.5 : 1.75} aria-hidden />
                </span>
                <span className="text-xs font-semibold sm:text-sm">
                  {s.label}
                  {done ? <span className="sr-only"> (listo)</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
