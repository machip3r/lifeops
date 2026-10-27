import Link from 'next/link';
import type { CollectionBoardRow } from '@/lib/supabase';
import { CARTERA_STATUS } from '@/lib/collections/status';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { DetailRow, DetailRows } from '@/components/dashboard/detail-card';

const numberEs = new Intl.NumberFormat('es-MX');

/** Cartera of the selected asesor (or everyone) by days late — same buckets as the aging chart. */
export function CollectionAgingCard({
  title,
  subtitle,
  rows,
  href,
}: {
  title: string;
  subtitle?: string;
  rows: CollectionBoardRow[];
  /** Asesor expediente link */
  href?: string;
}) {
  const late = (min: number, max: number) =>
    rows.filter((r) => (r.days_past_due ?? 0) >= min && (r.days_past_due ?? 0) <= max).length;
  const lines: Array<{ label: string; value: number; color?: string }> = [
    { label: 'Por vencer', value: rows.filter((r) => r.cartera_status === 'due_soon').length, color: CARTERA_STATUS.due_soon.color },
    { label: '1 a 10 días de atraso', value: late(1, 10), color: CARTERA_STATUS.overdue.color },
    { label: '11 a 20 días', value: late(11, 20), color: CARTERA_STATUS.overdue.color },
    { label: `21 a ${POLICY_AT_RISK_DAYS} días`, value: late(21, POLICY_AT_RISK_DAYS), color: CARTERA_STATUS.overdue.color },
    { label: `En peligro (más de ${POLICY_AT_RISK_DAYS})`, value: rows.filter((r) => r.cartera_status === 'at_risk').length, color: CARTERA_STATUS.at_risk.color },
    { label: 'Sin fecha de cobro', value: rows.filter((r) => r.cartera_status === 'no_payment').length },
  ];

  return (
    <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="border-b border-(--lifeops-border) px-4 py-3 sm:px-5">
        <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">{title}</h2>
        {subtitle ? <p className="text-sm text-(--lifeops-muted)">{subtitle}</p> : null}
      </header>
      <div className="px-4 py-3 sm:px-5">
        <DetailRows>
          <DetailRow label="Pólizas activas">{numberEs.format(rows.length)}</DetailRow>
          {lines.map((line) => (
            <DetailRow key={line.label} label={line.label}>
              <span className="inline-flex items-center gap-2 tabular-nums">
                {line.value > 0 && line.color ? (
                  <span className="h-2 w-2 rounded-full" style={{ background: line.color }} aria-hidden />
                ) : null}
                {line.value > 0 ? numberEs.format(line.value) : '—'}
              </span>
            </DetailRow>
          ))}
        </DetailRows>
        {href ? (
          <Link href={href} className="mt-4 block text-sm text-(--lifeops-accent) hover:underline">
            Ver expediente del asesor
          </Link>
        ) : null}
      </div>
    </section>
  );
}
