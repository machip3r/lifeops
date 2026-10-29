import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Empty screen / section: big golden icon, title, short explanation and what to do next.
 * `size="sm"` fits inside a table or card (no frame).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actions,
  children,
  size = 'lg',
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  /** Buttons under the text */
  actions?: ReactNode;
  /** Extra content (option cards, steps) under the actions */
  children?: ReactNode;
  size?: 'sm' | 'lg';
  className?: string;
}) {
  const large = size === 'lg';
  return (
    <section
      className={cn(
        'relative overflow-hidden text-center',
        large
          ? 'rounded-2xl border border-(--lifeops-border) bg-(--lifeops-chrome) px-5 py-12 sm:px-10 sm:py-16'
          : 'px-4 py-10',
        className,
      )}
    >
      {large ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top,rgb(251_219_172/0.14),transparent_70%)]"
          aria-hidden
        />
      ) : null}
      <div className={cn('relative mx-auto flex items-center justify-center', large ? 'h-28 w-28' : 'h-20 w-20')} aria-hidden>
        <span className="absolute inset-0 rounded-full bg-[#FBDBAC]/[0.07]" />
        <span className={cn('absolute rounded-full bg-[#FBDBAC]/[0.12]', large ? 'inset-3.5' : 'inset-2.5')} />
        <span
          className={cn(
            'relative flex items-center justify-center rounded-full bg-[#FBDBAC] text-[#1a1d24] shadow-[0_8px_30px_rgb(251_219_172/0.35)]',
            large ? 'h-16 w-16' : 'h-11 w-11',
          )}
        >
          <Icon className={large ? 'h-8 w-8' : 'h-5 w-5'} strokeWidth={1.75} />
        </span>
      </div>
      <h2 className={cn('relative font-semibold text-(--lifeops-fg)', large ? 'mt-6 text-xl sm:text-2xl' : 'mt-4 text-base')}>
        {title}
      </h2>
      {description ? (
        <p className={cn('relative mx-auto mt-2 max-w-xl text-(--lifeops-muted)', large ? 'text-sm sm:text-[15px]' : 'text-sm')}>
          {description}
        </p>
      ) : null}
      {actions ? <div className="relative mt-6 flex flex-wrap justify-center gap-3">{actions}</div> : null}
      {children ? <div className={cn('relative', large ? 'mt-8' : 'mt-5')}>{children}</div> : null}
    </section>
  );
}
