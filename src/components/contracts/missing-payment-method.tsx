import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Inline flag for a póliza without forma de pago (receipts are then calculated as monthly). */
export function MissingPaymentMethodFlag({ className }: { className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-(--lifeops-fg)', className)}
      title="Sin forma de pago: los recibos se calculan como mensuales"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--viz-overdue)' }} aria-hidden />
      Sin forma de pago
    </span>
  );
}

/** Notice asking to complete the forma de pago; `action` is where to fix it (button or link). */
export function MissingPaymentMethodNotice({ action, className }: { action?: ReactNode; className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-(--lifeops-border) bg-(--lifeops-hover)/50 px-3 py-2.5 text-sm text-(--lifeops-fg)',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: 'var(--viz-overdue)' }} aria-hidden />
      <div className="min-w-0">
        <p className="font-medium">Falta la forma de pago</p>
        <p className="text-(--lifeops-muted)">
          Mientras no la completes, los recibos se calculan como mensuales y la fecha de cobro puede no ser la correcta.
        </p>
        {action ? <div className="mt-1.5">{action}</div> : null}
      </div>
    </div>
  );
}
