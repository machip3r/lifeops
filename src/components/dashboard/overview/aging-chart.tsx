"use client";

import { useState } from "react";
import type { CollectionOverview } from "@/lib/supabase";
import {
  ChartCard,
  ChartLegend,
  ColumnPlot,
  DataTable,
  niceTicks,
  numberEs,
  type TooltipState,
} from "./chart-parts";

const BUCKETS = [
  { key: "d1_10", label: "1–10", atRisk: false },
  { key: "d11_20", label: "11–20", atRisk: false },
  { key: "d21_30", label: "21–30", atRisk: false },
  { key: "d31_60", label: "31–60", atRisk: true },
  { key: "d61_90", label: "61–90", atRisk: true },
  { key: "d90_plus", label: "+90", atRisk: true },
] as const;

/** Overdue pólizas by days past their next due date. */
export function AgingChart({
  aging,
  riskDays,
  className,
}: {
  aging: CollectionOverview["aging"];
  riskDays: number;
  className?: string;
}) {
  const [tip, setTip] = useState<TooltipState>(null);
  const values = BUCKETS.map((b) => aging[b.key]);
  const ticks = niceTicks(Math.max(0, ...values));
  const max = ticks[ticks.length - 1] || 1;
  const total = values.reduce((a, v) => a + v, 0);

  return (
    <ChartCard
      className={className}
      title="Antigüedad del atraso"
      subtitle={`${numberEs.format(total)} pólizas con cobro vencido, por días de atraso`}
      legend={
        <ChartLegend
          items={[
            { label: `Vencida (hasta ${riskDays} días)`, color: "var(--viz-overdue)" },
            { label: `En peligro (más de ${riskDays} días)`, color: "var(--viz-at-risk)" },
          ]}
        />
      }
      table={<DataTable head={["Días de atraso", "Pólizas"]} rows={BUCKETS.map((b, i) => [b.label, values[i]])} />}
    >
      <ColumnPlot ticks={ticks} xLabels={BUCKETS.map((b) => b.label)} tooltip={tip}>
        {BUCKETS.map((bucket, index) => {
          const value = values[index];
          const color = bucket.atRisk ? "var(--viz-at-risk)" : "var(--viz-overdue)";
          const state: TooltipState = {
            left: ((index + 0.5) / BUCKETS.length) * 100,
            title: `${bucket.label} días de atraso`,
            rows: [{ label: "pólizas", value: numberEs.format(value), color }],
          };
          return (
            <div
              key={bucket.key}
              tabIndex={0}
              aria-label={`${bucket.label} días de atraso: ${value} pólizas`}
              className="relative flex h-full flex-1 items-end justify-center rounded-sm hover:bg-(--lifeops-hover)/50 focus-visible:bg-(--lifeops-hover)/50 focus-visible:outline-none"
              onPointerEnter={() => setTip(state)}
              onPointerLeave={() => setTip(null)}
              onFocus={() => setTip(state)}
              onBlur={() => setTip(null)}
            >
              <div className="relative w-full max-w-6 rounded-t-[4px]" style={{ height: `${(value / max) * 100}%`, background: color }}>
                {value > 0 ? (
                  <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold text-(--lifeops-fg)">
                    {numberEs.format(value)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </ColumnPlot>
    </ChartCard>
  );
}
