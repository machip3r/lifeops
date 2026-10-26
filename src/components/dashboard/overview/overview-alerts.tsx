import Link from "next/link";
import { CircleCheck, CircleX, Info, TriangleAlert, type LucideIcon } from "lucide-react";
import type { CollectionOverview } from "@/lib/supabase";
import { numberEs } from "./chart-parts";

type Severity = "critical" | "warning" | "info";

const SEVERITY: Record<Severity, { icon: LucideIcon; color: string; label: string }> = {
  critical: { icon: CircleX, color: "var(--viz-at-risk)", label: "Urgente" },
  warning: { icon: TriangleAlert, color: "var(--viz-overdue)", label: "Atención" },
  info: { icon: Info, color: "var(--viz-due-soon)", label: "Aviso" },
};

type Alert = { severity: Severity; text: string; href: string };

/** Actionable notices derived from the overview counts (only those with something to do). */
function buildAlerts(o: CollectionOverview): Alert[] {
  const alerts: Alert[] = [];
  const n = (value: number) => numberEs.format(value);
  if (o.status.at_risk > 0) {
    alerts.push({ severity: "critical", text: `${n(o.status.at_risk)} póliza(s) en peligro: más de ${o.risk_days} días sin pago`, href: "/dashboard/collections" });
  }
  if (o.status.overdue > 0) {
    alerts.push({ severity: "warning", text: `${n(o.status.overdue)} póliza(s) con cobro vencido (hasta ${o.risk_days} días)`, href: "/dashboard/collections" });
  }
  if (o.status.no_payment > 0) {
    alerts.push({ severity: "warning", text: `${n(o.status.no_payment)} póliza(s) sin pagos registrados: no se puede calcular su próximo cobro`, href: "/dashboard/contracts" });
  }
  if (o.missing_payment_method > 0) {
    alerts.push({ severity: "warning", text: `${n(o.missing_payment_method)} póliza(s) sin forma de pago: se calcula como mensual`, href: "/dashboard/contracts" });
  }
  if (o.due_today > 0) {
    alerts.push({ severity: "info", text: `${n(o.due_today)} cobro(s) vencen hoy`, href: "/dashboard/collections" });
  }
  if (o.consultants_not_invited) {
    alerts.push({ severity: "info", text: `${n(o.consultants_not_invited)} asesor(es) sin invitar a LifeOps`, href: "/dashboard/consultants" });
  }
  if (o.consultants_pending_invite) {
    alerts.push({ severity: "info", text: `${n(o.consultants_pending_invite)} invitación(es) de asesor sin aceptar`, href: "/dashboard/consultants" });
  }
  return alerts;
}

export function OverviewAlerts({ overview, className }: { overview: CollectionOverview; className?: string }) {
  const alerts = buildAlerts(overview);
  return (
    <section className={`flex min-w-0 flex-col rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) ${className ?? ""}`}>
      <header className="flex items-center justify-between gap-2 px-5 pt-5 pb-3 sm:px-6">
        <h3 className="text-base font-semibold text-(--lifeops-fg)">Avisos</h3>
        <span className="text-sm text-(--lifeops-muted)">{alerts.length}</span>
      </header>
      {alerts.length === 0 ? (
        <p className="flex items-center gap-2 px-5 pb-5 text-sm text-(--lifeops-fg) sm:px-6">
          <CircleCheck className="h-4 w-4 shrink-0" style={{ color: "var(--viz-current)" }} aria-hidden />
          Todo en orden por ahora.
        </p>
      ) : (
        <ul className="divide-y divide-(--lifeops-border) border-t border-(--lifeops-border)">
          {alerts.map((alert) => {
            const { icon: Icon, color, label } = SEVERITY[alert.severity];
            return (
              <li key={alert.text}>
                <Link
                  href={alert.href}
                  className="flex items-start gap-3 px-5 py-3 text-sm text-(--lifeops-fg) hover:bg-(--lifeops-hover) focus-visible:bg-(--lifeops-hover) focus-visible:outline-none sm:px-6"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color }} aria-label={label} />
                  <span>{alert.text}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
