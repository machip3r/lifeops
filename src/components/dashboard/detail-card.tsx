import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type CardProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/** Compact facts panel for entity detail pages. */
export function DetailCard({ title, actions, children, className }: CardProps) {
  return (
    <section className={cn("mb-6 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4 sm:p-5", className)}>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">{title}</h2>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

/** Label / value rows (one fact per line), e.g. the póliza side panel. */
export function DetailRows({ children }: { children: ReactNode }) {
  return <dl className="divide-y divide-(--lifeops-border)">{children}</dl>;
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
      <dt className="shrink-0 text-[13px] text-(--lifeops-muted)">{label}</dt>
      <dd className="min-w-0 text-right text-[13px] break-words text-(--lifeops-fg)">{children}</dd>
    </div>
  );
}
