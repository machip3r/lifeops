'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

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
  /** Disable backdrop / close while submitting */
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
  if (!open) return null;

  const maxWidth = size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  const zClass = elevated ? 'z-[60]' : 'z-50';

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-end justify-center bg-black/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 dark:bg-black/70`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`flex max-h-[92vh] w-full ${maxWidth} flex-col overflow-hidden rounded-t-2xl border border-(--lifeops-border) bg-(--lifeops-chrome) text-(--lifeops-fg) shadow-2xl sm:max-h-[90vh] sm:rounded-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-(--lifeops-border) px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="app-dialog-title" className="text-xl font-semibold text-(--lifeops-accent)">
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-[13px] text-(--lifeops-muted)">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar"
            className="-mr-1.5 cursor-pointer rounded-md p-1.5 text-(--lifeops-muted) transition-colors hover:bg-(--lifeops-hover) hover:text-(--lifeops-fg) focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-(--lifeops-border) bg-(--lifeops-chrome) px-5 py-3.5 sm:px-6">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
