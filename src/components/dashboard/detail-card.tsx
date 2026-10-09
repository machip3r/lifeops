import type { ReactNode } from 'react';

type CardProps = {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
};

/** Compact facts panel for entity detail pages. */
export function DetailCard({ title, actions, children }: CardProps) {
  return (
    <section className="mb-6 rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) p-5 sm:p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-semibold text-(--lifeops-fg)">{title}</h2>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">{children}</div>;
}

export function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-(--lifeops-muted)">
        {label}
      </p>
      <div className="mt-1 break-words text-sm text-(--lifeops-fg)">{children}</div>
    </div>
  );
}
