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
    <header className={cn('mb-5 text-left', className)}>
      {eyebrow ? <div className="relative z-20 mb-2 text-sm">{eyebrow}</div> : null}

      <div className="relative min-h-[4.25rem] overflow-x-clip sm:min-h-[5.25rem]">
        <div
          className="dashboard-page-watermark pointer-events-none absolute -left-1 top-0 select-none"
          aria-hidden
        >
          {mark}
        </div>

        <div className="relative z-10 pt-5 sm:pt-7">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="dashboard-page-title text-[1.75rem] leading-tight font-bold sm:text-3xl">{title}</h1>
              {description ? (
                <div className="mt-1 max-w-3xl text-sm text-(--lifeops-muted)">
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
