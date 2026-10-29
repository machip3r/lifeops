'use client';

import { CheckCircle2 } from 'lucide-react';
import { DiffReview, FilledFieldsSummary } from '@/components/extractor/diff-review';
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
      <FilledFieldsSummary items={filled.map((i) => ({ key: i.contractNumber, fills: i.fills }))} />
      <DiffReview
        items={withDiffs.map((i) => ({ key: i.contractNumber, subtitle: i.clientName, diffs: i.diffs }))}
        picks={picks}
        onChange={onChange}
        description="Por defecto se conserva lo que ya tienes en LifeOps (recibos incluidos). Elige el valor del archivo solo donde quieras actualizar; los recibos nuevos se agregan siempre."
      />
    </div>
  );
}
