import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Titled group of fields inside a form or dialog (semantic fieldset, light divider between groups). */
export function FormSection({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  /** e.g. a segmented control next to the title */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cn('min-w-0 border-t border-(--lifeops-border) pt-5 first:border-t-0 first:pt-0', className)}>
      {/* legend first (fieldset semantics); float keeps it in the normal flow */}
      <legend className="float-left mb-4 flex w-full flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-(--lifeops-accent)">{title}</span>
          {description ? <span className="mt-0.5 block text-xs text-(--lifeops-muted)">{description}</span> : null}
        </span>
        {actions}
      </legend>
      <div className="clear-both space-y-4">{children}</div>
    </fieldset>
  );
}
