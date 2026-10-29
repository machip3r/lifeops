'use client';

import { useRef, type ReactNode } from 'react';
import { Loader2, X } from 'lucide-react';
import { useBusyLock } from '@/hooks/use-busy-lock';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Sticky action row (buttons). Submit buttons outside the form use `form="<form id>"`. */
  footer?: ReactNode;
  /** Wider panel for denser forms */
  size?: 'md' | 'lg' | 'xl';
  /** While submitting: no close (X, backdrop, Escape, Tab out) and no leaving the page */
  busy?: boolean;
  /** Use when stacking over another dialog (e.g. invite from registrar póliza). */
  elevated?: boolean;
};

/**
 * Shared dashboard modal shell: fixed header and footer, scrolling body.
 */
export function AppDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  busy = false,
  elevated = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  useBusyLock(open && busy, panelRef);
  if (!open) return null;

  const maxWidth = size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  const zClass = elevated ? 'z-[60]' : 'z-50';

  return (
    <div
      className={cn(
        'fixed inset-0 flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 dark:bg-black/70',
        zClass,
        busy && 'cursor-wait',
      )}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      aria-busy={busy || undefined}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-(--lifeops-border) bg-(--lifeops-chrome) text-(--lifeops-fg) shadow-2xl outline-none sm:max-h-[90vh] sm:rounded-2xl',
          maxWidth,
          busy && 'cursor-default',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-(--lifeops-border) px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="app-dialog-title" className="text-xl font-semibold text-(--lifeops-accent)">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[13px] text-(--lifeops-muted)">{description}</p> : null}
          </div>
          {busy ? (
            // Nothing to close while it runs: a spinner instead of the X
            <span className="-mr-1.5 p-1.5 text-(--lifeops-accent)" role="status" aria-label="Procesando, espera un momento">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </span>
          ) : (
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="-mr-1.5 cursor-pointer rounded-md p-1.5 text-(--lifeops-muted) transition-colors hover:bg-(--lifeops-hover) hover:text-(--lifeops-fg) focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          )}
        </header>
        {/* inert: fields and links can't be used until it finishes */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6" inert={busy || undefined}>
          {children}
        </div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-(--lifeops-border) bg-(--lifeops-chrome) px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
