import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type PageHeaderProps = {
  title: string;
  /** Large backdrop word. Defaults to uppercased title. */
  watermark?: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** e.g. back link — sits above the watermark so it never overlaps */
  eyebrow?: ReactNode;
  className?: string;
};

export function PageHeader({
  title,
  watermark,
  description,
  actions,
  eyebrow,
  className,
}: PageHeaderProps) {
  const mark = (watermark ?? title).toUpperCase();

  return (
    <header className={cn('mb-8 text-left', className)}>
      {eyebrow ? <div className="relative z-20 mb-3">{eyebrow}</div> : null}

      <div className="relative min-h-[4.5rem] sm:min-h-[5.5rem]">
        <div
          className="dashboard-page-watermark pointer-events-none absolute inset-x-0 top-0 select-none"
          aria-hidden
        >
          {mark}
        </div>

        <div className="relative z-10 pt-6 sm:pt-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="dashboard-page-title text-4xl font-bold">{title}</h1>
              {description ? (
                <div className="mt-2 max-w-2xl text-sm text-(--lifeops-muted) sm:text-base">
                  {description}
                </div>
              ) : null}
            </div>
            {actions ? <div className="relative z-10 shrink-0">{actions}</div> : null}
          </div>
        </div>
      </div>
    </header>
  );
}
