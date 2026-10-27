import type { CarteraStatusCounts } from '@/lib/supabase';
import { CARTERA_STATES } from '@/components/dashboard/overview/cartera-status';

/** Thin stacked bar of cartera states (al corriente → en peligro) for table rows. */
export function CarteraMiniBar({ counts, className }: { counts: CarteraStatusCounts; className?: string }) {
  const total = CARTERA_STATES.reduce((sum, s) => sum + counts[s.key], 0);
  if (total === 0) return null;
  return (
    <div className={`flex h-1.5 w-20 gap-px overflow-hidden rounded-full ${className ?? ''}`} aria-hidden>
      {CARTERA_STATES.map((s) =>
        counts[s.key] ? (
          <span key={s.key} style={{ flexGrow: counts[s.key], flexBasis: 0, background: s.color }} />
        ) : null,
      )}
    </div>
  );
}
