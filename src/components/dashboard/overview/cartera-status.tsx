"use client";

import { useState } from "react";
import type { CarteraStatusCounts } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import {
  ChartCard,
  ChartLegend,
  ChartTooltip,
  DataTable,
  numberEs,
  type TooltipState,
} from "./chart-parts";

/** Cartera states in reading order (healthy → critical). `no_payment` is shown apart. */
export const CARTERA_STATES = [
  { key: "current", label: "Al corriente", color: "var(--viz-current)" },
  { key: "due_soon", label: "Por vencer", color: "var(--viz-due-soon)" },
  { key: "overdue", label: "Vencida", color: "var(--viz-overdue)" },
  { key: "at_risk", label: "En peligro", color: "var(--viz-at-risk)" },
] as const;

export function carteraWithData(status: CarteraStatusCounts): number {
  return status.current + status.due_soon + status.overdue + status.at_risk;
}

const percentEs = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 });

/** One stacked segment row; segments carry their own hover/focus readout. */
export function StatusStack({
  counts,
  scaleTotal,
  height,
  onTooltip,
  title,
}: {
  counts: CarteraStatusCounts;
  /** Bar length = sum / scaleTotal (1 = full width) */
  scaleTotal: number;
  height: string;
  onTooltip: (state: TooltipState) => void;
  title: string;
}) {
  const total = carteraWithData(counts);
  if (total === 0 || scaleTotal === 0) return <div className={height} aria-hidden />;
  // Share of the stack before each state (for tooltip anchoring)
  const starts = CARTERA_STATES.map((_, i) =>
    CARTERA_STATES.slice(0, i).reduce((sum, s) => sum + counts[s.key] / total, 0),
  );
  return (
    <div className={cn("flex gap-[2px]", height)} style={{ width: `${(total / scaleTotal) * 100}%` }}>
      {CARTERA_STATES.map((state, i) => {
        const value = counts[state.key];
        if (value === 0) return null;
        const share = value / total;
        const center = ((starts[i] + share / 2) * total) / scaleTotal;
        const tip: TooltipState = {
          left: center * 100,
          title,
          rows: [{ label: state.label, value: `${numberEs.format(value)} · ${percentEs.format(share)}`, color: state.color }],
        };
        return (
          <div
            key={state.key}
            tabIndex={0}
            aria-label={`${title}: ${state.label}, ${value} pólizas`}
            className="min-w-[3px] cursor-default first:rounded-l-[4px] last:rounded-r-[4px] hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
            style={{ flexGrow: value, flexBasis: 0, background: state.color }}
            onPointerEnter={() => onTooltip(tip)}
            onPointerLeave={() => onTooltip(null)}
            onFocus={() => onTooltip(tip)}
            onBlur={() => onTooltip(null)}
          />
        );
      })}
    </div>
  );
}

/** Part-to-whole of active pólizas by next due. */
export function CarteraStatusCard({ status, className }: { status: CarteraStatusCounts; className?: string }) {
  const [tip, setTip] = useState<TooltipState>(null);
  const total = carteraWithData(status);
  const healthy = status.current + status.due_soon;

  return (
    <ChartCard
      className={className}
      title="Estado de la cartera"
      subtitle={`${numberEs.format(total)} pólizas activas con pagos registrados, según su próximo cobro`}
      legend={
        <ChartLegend
          items={CARTERA_STATES.map((s) => ({
            label: s.label,
            color: s.color,
            value: total ? `${numberEs.format(status[s.key])} · ${percentEs.format(status[s.key] / total)}` : "0",
          }))}
        />
      }
      table={
        <DataTable
          head={["Estado", "Pólizas"]}
          rows={[
            ...CARTERA_STATES.map((s) => [s.label, status[s.key]] as [string, number]),
            ["Sin pagos registrados", status.no_payment],
          ]}
        />
      }
    >
      {total === 0 ? (
        <p className="py-6 text-sm text-(--lifeops-muted)">
          Aún no hay pólizas con pagos registrados. Importa un archivo de comisiones o registra pagos en cobranza.
        </p>
      ) : (
        <>
          <p className="flex items-baseline gap-2">
            <span className="text-5xl font-semibold text-(--lifeops-fg)">{percentEs.format(healthy / total)}</span>
            <span className="text-sm text-(--lifeops-muted)">al día (al corriente o por vencer)</span>
          </p>
          <div className="relative mt-2">
            <ChartTooltip state={tip} above />
            <StatusStack counts={status} scaleTotal={total} height="h-6" onTooltip={setTip} title="Cartera" />
          </div>
        </>
      )}
      {status.no_payment > 0 ? (
        <p className="text-xs text-(--lifeops-muted)">
          {numberEs.format(status.no_payment)} póliza(s) sin pagos registrados no aparecen en la barra porque no se puede calcular su próximo cobro.
        </p>
      ) : null}
    </ChartCard>
  );
}
