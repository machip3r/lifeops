"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChartCard,
  ChartLegend,
  ColumnPlot,
  DataTable,
  niceTicks,
  numberEs,
  type TooltipState,
} from "./chart-parts";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Payments registered per month: this year (accent) vs last year (context), January → current month. */
export function MonthlyPaymentsChart({
  monthly,
  today,
  className,
}: {
  monthly: Array<{ year: number; month: number; count: number }>;
  today: string;
  className?: string;
}) {
  const [tip, setTip] = useState<TooltipState>(null);
  const year = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const countOf = (y: number, m: number) => monthly.find((r) => r.year === y && r.month === m)?.count ?? 0;
  const rows = Array.from({ length: currentMonth }, (_, i) => ({
    month: i + 1,
    current: countOf(year, i + 1),
    previous: countOf(year - 1, i + 1),
  }));
  const ticks = niceTicks(Math.max(0, ...rows.flatMap((r) => [r.current, r.previous])));
  const max = ticks[ticks.length - 1] || 1;
  const sumCurrent = rows.reduce((a, r) => a + r.current, 0);
  const sumPrevious = rows.reduce((a, r) => a + r.previous, 0);
  const period = currentMonth > 1 ? `ene–${MONTHS[currentMonth - 1].toLowerCase()}` : "ene";

  return (
    <ChartCard
      className={className}
      title="Pagos registrados por mes"
      subtitle={`Pagos por fecha de pago, ${year} vs ${year - 1}`}
      legend={
        <ChartLegend
          items={[
            { label: String(year), color: "var(--viz-this-year)", value: `${numberEs.format(sumCurrent)} (${period})` },
            { label: String(year - 1), color: "var(--viz-last-year)", value: `${numberEs.format(sumPrevious)} (mismo periodo)` },
          ]}
        />
      }
      table={
        <DataTable
          head={["Mes", String(year), String(year - 1)]}
          rows={rows.map((r) => [MONTHS[r.month - 1], r.current, r.previous])}
        />
      }
    >
      <ColumnPlot ticks={ticks} xLabels={rows.map((r) => MONTHS[r.month - 1])} tooltip={tip}>
        {rows.map((r, index) => {
          const state: TooltipState = {
            left: ((index + 0.5) / rows.length) * 100,
            title: `${MONTHS[r.month - 1]}`,
            rows: [
              { label: String(year), value: numberEs.format(r.current), color: "var(--viz-this-year)" },
              { label: String(year - 1), value: numberEs.format(r.previous), color: "var(--viz-last-year)" },
            ],
          };
          const isLast = index === rows.length - 1;
          return (
            <div
              key={r.month}
              tabIndex={0}
              aria-label={`${MONTHS[r.month - 1]}: ${r.current} pagos en ${year}, ${r.previous} en ${year - 1}`}
              className="relative flex h-full flex-1 items-end justify-center gap-[2px] rounded-sm hover:bg-(--lifeops-hover)/50 focus-visible:bg-(--lifeops-hover)/50 focus-visible:outline-none"
              onPointerEnter={() => setTip(state)}
              onPointerLeave={() => setTip(null)}
              onFocus={() => setTip(state)}
              onBlur={() => setTip(null)}
            >
              <div
                className="w-full max-w-3.5 rounded-t-[4px]"
                style={{ height: `${(r.previous / max) * 100}%`, background: "var(--viz-last-year)" }}
              />
              <div
                className={cn("relative w-full max-w-3.5 rounded-t-[4px]")}
                style={{ height: `${(r.current / max) * 100}%`, background: "var(--viz-this-year)" }}
              >
                {isLast ? (
                  <span className="absolute bottom-full left-1/2 mb-1 -translate-x-1/2 text-xs font-semibold text-(--lifeops-fg)">
                    {numberEs.format(r.current)}
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
