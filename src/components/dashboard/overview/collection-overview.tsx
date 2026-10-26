"use client";

import { useCallback, useState } from "react";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CircleAlert, FileText, HandCoins, Siren } from "lucide-react";
import { useQueryEffect, useQueryLoading } from "@/hooks/use-query-effect";
import { PENDING_PAYMENT_WITHIN_DAYS, POLICY_AT_RISK_DAYS } from "@/lib/collections/constants";
import { db } from "@/lib/db";
import type { CollectionOverview as Overview } from "@/lib/supabase";
import { AgingChart } from "./aging-chart";
import { CarteraStatusCard } from "./cartera-status";
import { numberEs } from "./chart-parts";
import { ConsultantCarteraChart } from "./consultant-cartera-chart";
import { MonthlyPaymentsChart } from "./monthly-payments-chart";
import { OverviewAlerts } from "./overview-alerts";
import { StatTile } from "./stat-tile";

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function PaymentsDelta({ current, previous, today }: { current: number; previous: number; today: string }) {
  const month = Number(today.slice(5, 7));
  const prevMonth = MONTH_NAMES[(month + 10) % 12];
  const diff = current - previous;
  if (diff === 0) return <>Igual que el mismo periodo de {prevMonth}</>;
  const up = diff > 0;
  const Arrow = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1">
      <Arrow
        className="h-3.5 w-3.5"
        style={{ color: up ? "var(--viz-current)" : "var(--viz-at-risk)" }}
        aria-label={up ? "Más" : "Menos"}
      />
      {numberEs.format(Math.abs(diff))} {up ? "más" : "menos"} que el mismo periodo de {prevMonth}
    </span>
  );
}

/**
 * Vista general: KPIs, cartera status, avisos and charts from one SQL call
 * (`get_collection_overview`). Counts only — amounts are not reliable yet (mixed currencies).
 */
export function CollectionOverview({ scope }: { scope: { officeId: string } | { consultantId: string } }) {
  const officeId = "officeId" in scope ? scope.officeId : undefined;
  const consultantId = "consultantId" in scope ? scope.consultantId : undefined;
  const [loading, setLoading] = useQueryLoading(`${officeId ?? ""}:${consultantId ?? ""}`);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await db.dashboard.getCollectionOverview({
        officeId,
        consultantId,
        riskDays: POLICY_AT_RISK_DAYS,
        dueSoonDays: PENDING_PAYMENT_WITHIN_DAYS,
      });
      setOverview(data);
      setError(null);
    } catch (e) {
      console.error("load collection overview:", e);
      setError("No se pudo cargar el resumen de la cartera.");
    } finally {
      setLoading(false);
    }
  }, [officeId, consultantId, setLoading]);

  useQueryEffect(true, load);

  if (loading && !overview) {
    return <p className="py-10 text-center text-(--lifeops-muted)">Cargando resumen…</p>;
  }
  if (error || !overview) {
    return (
      <p className="rounded-xl border border-(--lifeops-border) px-4 py-6 text-center text-(--lifeops-muted)" role="alert">
        {error ?? "No se pudo cargar el resumen de la cartera."}
      </p>
    );
  }

  return <CollectionOverviewView overview={overview} officeView={Boolean(officeId)} refreshing={loading} />;
}

/** Presentational Vista general (KPIs, cartera, avisos, charts) for one overview snapshot. */
function CollectionOverviewView({
  overview,
  officeView,
  refreshing = false,
}: {
  overview: Overview;
  /** Promotoría view: per-asesor chart and invite notices */
  officeView: boolean;
  /** Refetch keeps the previous render, dimmed */
  refreshing?: boolean;
}) {
  const o = overview;
  return (
    <div className={refreshing ? "opacity-60 transition-opacity" : undefined}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile
          label="Pólizas activas"
          value={numberEs.format(o.active_contracts)}
          icon={FileText}
          detail={officeView ? `${numberEs.format(o.by_consultant.length)} asesor(es) con cartera` : undefined}
        />
        <StatTile
          label="Cobros de hoy"
          value={numberEs.format(o.due_today)}
          icon={CalendarClock}
          detail={`${numberEs.format(o.due_next_7_days)} en los próximos 7 días`}
        />
        <StatTile
          label="Pagos registrados este mes"
          value={numberEs.format(o.payments_month_to_date)}
          icon={HandCoins}
          detail={
            <PaymentsDelta current={o.payments_month_to_date} previous={o.payments_prev_month_to_date} today={o.today} />
          }
        />
        <StatTile
          label="Vencidas"
          value={numberEs.format(o.status.overdue)}
          icon={CircleAlert}
          detail={`Hasta ${o.risk_days} días de atraso`}
        />
        <StatTile
          label="En peligro"
          value={numberEs.format(o.status.at_risk)}
          icon={Siren}
          detail={`Más de ${o.risk_days} días sin pago`}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CarteraStatusCard status={o.status} className="lg:col-span-2" />
        <OverviewAlerts overview={o} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <MonthlyPaymentsChart monthly={o.monthly_payments} today={o.today} />
        <AgingChart aging={o.aging} riskDays={o.risk_days} />
      </div>

      {officeView && o.by_consultant.length > 1 ? (
        <ConsultantCarteraChart rows={o.by_consultant} className="mt-4" />
      ) : null}

      <p className="mt-3 text-xs text-(--lifeops-muted)">
        Conteos de pólizas y pagos registrados en LifeOps (archivos de comisiones y pagos capturados).
        Los importes no se muestran porque las pólizas manejan distintas monedas.
      </p>
    </div>
  );
}
