'use client';

import { useRef, type ReactNode } from 'react';
import { Check, Loader2, ShieldAlert } from 'lucide-react';
import { useBusyLock } from '@/hooks/use-busy-lock';
import { cn } from '@/lib/utils';

export type ImportStage = {
  label: string;
  state: 'pending' | 'active' | 'done';
  /** Short line under the label (counts, "120 de 800 pólizas") */
  detail?: string;
};

type ImportProgressCardProps = {
  title: string;
  message?: string;
  /** 0–100; null = indeterminate bar */
  percent: number | null;
  /** Under the bar, left: "1,200 de 3,400 pólizas" */
  countLabel?: string;
  /** Under the bar, right: "Tiempo restante: ~2 min" */
  etaLabel?: string;
  stages?: ImportStage[];
  /** Bottom note (e.g. "No cierres esta página…") */
  note?: ReactNode;
  /** Extra content under the note (e.g. Cancelar) */
  footer?: ReactNode;
  className?: string;
};

/** Progress of an import step: spinner, title, bar, counts and the list of stages. */
export function ImportProgressCard({
  title,
  message,
  percent,
  countLabel,
  etaLabel,
  stages,
  note,
  footer,
  className,
}: ImportProgressCardProps) {
  const pct = percent == null ? null : Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      className={cn('rounded-2xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5 sm:p-6', className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-4">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#FBDBAC]/15 text-(--lifeops-accent)">
          <Loader2 className="h-6 w-6 animate-spin" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-(--lifeops-fg) sm:text-lg">{title}</h3>
          {message ? <p className="mt-0.5 text-sm text-(--lifeops-muted)">{message}</p> : null}
        </div>
        {pct != null ? (
          <span className="shrink-0 text-2xl font-semibold tabular-nums text-(--lifeops-fg)">{pct}%</span>
        ) : null}
      </div>

      <div
        className="mt-5 h-2 overflow-hidden rounded-full bg-(--lifeops-hover)"
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct ?? undefined}
      >
        {pct == null ? (
          <div className="lifeops-indeterminate h-full w-2/5 rounded-full bg-[#FBDBAC]" />
        ) : (
          <div className="h-full rounded-full bg-[#FBDBAC] transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
        )}
      </div>
      {countLabel || etaLabel ? (
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-(--lifeops-muted)">
          <span className="tabular-nums">{countLabel}</span>
          <span className="tabular-nums">{etaLabel}</span>
        </div>
      ) : null}

      {stages?.length ? (
        <ol className="mt-5 space-y-3">
          {stages.map((stage) => (
            <li key={stage.label} className="flex items-start gap-3">
              <span
                className={cn(
                  'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                  stage.state === 'done' && 'border-(--lifeops-accent) bg-(--lifeops-accent) text-(--lifeops-on-accent)',
                  stage.state === 'active' && 'border-(--lifeops-accent) text-(--lifeops-accent)',
                  stage.state === 'pending' && 'border-(--lifeops-border)',
                )}
                aria-hidden
              >
                {stage.state === 'done' ? (
                  <Check className="h-3 w-3" strokeWidth={3} />
                ) : stage.state === 'active' ? (
                  <Loader2 className="h-3 w-3 animate-spin" strokeWidth={3} />
                ) : null}
              </span>
              <div className="min-w-0">
                <p
                  className={cn(
                    'text-sm',
                    stage.state === 'pending' ? 'text-(--lifeops-muted)' : 'text-(--lifeops-fg)',
                    stage.state === 'active' && 'font-medium',
                  )}
                >
                  {stage.label}
                  <span className="sr-only">
                    {stage.state === 'done' ? ' (listo)' : stage.state === 'active' ? ' (en curso)' : ' (pendiente)'}
                  </span>
                </p>
                {stage.detail ? <p className="text-xs text-(--lifeops-muted)">{stage.detail}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      {note ? (
        <p className="mt-5 flex items-start gap-2 rounded-lg bg-(--lifeops-hover)/60 px-3 py-2.5 text-xs text-(--lifeops-muted)">
          <ShieldAlert className="mt-px h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden />
          <span>{note}</span>
        </p>
      ) : null}
      {footer ? <div className="mt-4 flex justify-end">{footer}</div> : null}
    </div>
  );
}

/**
 * Full-screen progress of a running import. Covers the whole app (sidebar included) and uses
 * `useBusyLock`, so nothing can be clicked and the page can't be left until it finishes.
 */
export function ImportProgressOverlay({ open, ...card }: ImportProgressCardProps & { open: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useBusyLock(open, panelRef);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[55] flex cursor-wait items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-busy="true"
      aria-label={card.title}
    >
      <div ref={panelRef} tabIndex={-1} className="w-full max-w-lg cursor-default outline-none animate-in fade-in zoom-in-95 duration-200">
        <ImportProgressCard
          {...card}
          note={card.note ?? 'No cierres ni recargues esta página hasta que termine; si lo haces, la importación se queda a medias.'}
          className="shadow-2xl"
        />
      </div>
    </div>
  );
}
