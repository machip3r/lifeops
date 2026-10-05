'use client';

import type { ReactNode } from 'react';

type Props = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  /** Wider panel for denser forms */
  size?: 'md' | 'lg';
  /** Disable backdrop / close while submitting */
  busy?: boolean;
  /** Use when stacking over another dialog (e.g. invite from registrar póliza). */
  elevated?: boolean;
};

/**
 * Shared dashboard modal shell — dark chrome matching Registrar póliza.
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

  const maxWidth = size === 'lg' ? 'max-w-2xl' : 'max-w-lg';
  const zClass = elevated ? 'z-[60]' : 'z-50';

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-center justify-center bg-black/70 p-4 backdrop-blur-[2px]`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-dialog-title"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} max-h-[90vh] overflow-y-auto rounded-xl border border-[#3a4049] bg-[#242830] shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2
                id="app-dialog-title"
                className="dashboard-page-title text-2xl font-bold"
              >
                {title}
              </h2>
              {description ? (
                <p className="mt-1 text-sm text-[#9ca3af]">{description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Cerrar"
              className="rounded-md p-1.5 text-[#9ca3af] transition-colors hover:bg-[#1a1d23] hover:text-[#FBDBAC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] disabled:opacity-50"
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
