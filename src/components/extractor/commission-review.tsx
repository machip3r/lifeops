'use client';

import { CheckCircle2 } from 'lucide-react';
import { DiffReview } from '@/components/extractor/diff-review';
import { Skeleton } from '@/components/ui/skeleton';
import type { CommissionChangeItem } from '@/lib/extractor/import/types';

/** Commission re-import, step 2: what the file changes on pólizas already in LifeOps. */
export function CommissionReview({
  items,
  error,
  picks,
  onChange,
}: {
  /** null while comparing */
  items: CommissionChangeItem[] | null;
  error: string;
  picks: Record<string, string[]>;
  onChange: (next: Record<string, string[]>) => void;
}) {
  if (items == null) {
    return (
      <div className="space-y-2" role="status" aria-live="polite">
        <span className="sr-only">Comparando con LifeOps</span>
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const withDiffs = items.filter((i) => i.diffs.length > 0);
  const filled = items.filter((i) => i.fills.length > 0);

  return (
    <div className="space-y-3">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-sm text-(--lifeops-fg)">
          {error}
        </p>
      ) : null}
      {withDiffs.length === 0 && filled.length === 0 && !error ? (
        <p className="flex items-center gap-2 text-sm text-(--lifeops-muted)">
          <CheckCircle2 className="h-4 w-4 text-(--viz-current)" aria-hidden />
          Las pólizas que ya estaban en LifeOps coinciden con el archivo; solo se agregarán sus recibos nuevos.
        </p>
      ) : null}
      {filled.length > 0 ? (
        <details className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3 text-sm">
          <summary className="cursor-pointer text-(--lifeops-fg)">
            Se completarán datos vacíos en {filled.length} póliza(s) <span className="text-(--lifeops-muted)">(automático)</span>
          </summary>
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-xs text-(--lifeops-muted)">
            {filled.slice(0, 200).map((i) => (
              <li key={i.contractNumber}>
                <span className="font-mono text-(--lifeops-fg)">{i.contractNumber}</span>:{' '}
                {i.fills.map((f) => `${f.label} ${f.incoming}`).join(' · ')}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <DiffReview
        items={withDiffs.map((i) => ({ key: i.contractNumber, subtitle: i.clientName, diffs: i.diffs }))}
        picks={picks}
        onChange={onChange}
        description="Por defecto se conserva lo que ya tienes en LifeOps (recibos incluidos). Marca lo que quieras actualizar con este archivo; los recibos nuevos se agregan siempre."
      />
    </div>
  );
}
