import { DotBadge } from "@/components/ui/dot-badge";
import { PORTFOLIO_STATUS, type PortfolioStatus } from "@/lib/collections/status";

/** Cartera status chip (+ days late for overdue / at risk). */
export function CarteraStatusBadge({
  status,
  daysOverdue,
  className,
}: {
  status: PortfolioStatus;
  daysOverdue?: number | null;
  className?: string;
}) {
  const { label, color } = PORTFOLIO_STATUS[status];
  const showDays = (status === "overdue" || status === "at_risk") && daysOverdue != null && daysOverdue > 0;
  return <DotBadge label={label} color={color} extra={showDays ? `· ${daysOverdue} d` : undefined} className={className} />;
}
