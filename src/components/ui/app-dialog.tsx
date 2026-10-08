'use client';

import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider panel for denser forms */
  size?: 'md' | 'lg' | 'xl';
  /** Disable backdrop / close while submitting */
  busy?: boolean;
  /** Use when stacking over another dialog (e.g. invite from registrar póliza). */
  elevated?: boolean;
};

/**
 * Shared dashboard modal shell — theme-aware chrome.
 */
export function AppDialog({
  open,
  title,
  description,
  onClose,
  children,
  size = 'md',
  busy = false,
  elevated = false,
}: Props) {
  if (!open) return null;

  const maxWidth =
    size === 'xl' ? 'max-w-4xl' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  const zClass = elevated ? 'z-[60]' : 'z-50';

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/50 p-4 backdrop-blur-[2px] dark:bg-black/70`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) text-(--lifeops-fg) shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="space-y-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="app-dialog-title"
                className="text-2xl font-bold text-(--lifeops-accent)"
              >
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-(--lifeops-muted)">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
              className="cursor-pointer rounded-md p-1.5 text-(--lifeops-muted) transition-colors hover:bg-(--lifeops-hover) hover:text-(--lifeops-accent) focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] disabled:opacity-50"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
