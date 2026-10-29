"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared chart chrome for Vista general: card, legend, tooltip, data table, axis ticks. */

export const numberEs = new Intl.NumberFormat("es-MX");

export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  children,
  className,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: ReactNode;
  /** Table twin of the chart (accessible values without hovering). */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4 sm:p-5",
        className,
      )}
    >
      <header>
        <h3 className="text-[15px] font-semibold text-(--lifeops-fg)">{title}</h3>
        {subtitle ? <p className="mt-0.5 text-xs text-(--lifeops-muted)">{subtitle}</p> : null}
      </header>
      {children}
      {legend}
      {table ? (
        <details className="text-xs">
          <summary className="w-fit cursor-pointer rounded text-(--lifeops-muted) hover:text-(--lifeops-fg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]">
            Ver datos
          </summary>
          <div className="mt-3 overflow-x-auto">{table}</div>
        </details>
      ) : null}
    </section>
  );
}

export type LegendItem = { label: string; color: string; value?: string };

/** Legend: swatch + label (+ value in muted ink). Identity never relies on color alone. */
export function ChartLegend({ items }: { items: LegendItem[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} aria-hidden />
          <span className="text-(--lifeops-fg)">{item.label}</span>
          {item.value ? <span className="text-(--lifeops-muted)">{item.value}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export type TooltipState = {
  /** Horizontal anchor as % of the plot width */
  left: number;
  title: string;
  rows: Array<{ label: string; value: string; color: string }>;
} | null;

/** Hover/focus readout: values lead, labels follow, keyed by a short line of the series color. */
export function ChartTooltip({ state, above = false }: { state: TooltipState; above?: boolean }) {
  if (!state) return null;
  return (
    <div
      role="status"
      className={cn(above ? "bottom-full mb-1" : "top-0", "pointer-events-none absolute z-10 min-w-36 -translate-x-1/2 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) px-3 py-2 text-xs shadow-lg")}
      style={{ left: `${Math.min(88, Math.max(12, state.left))}%` }}
    >
      <p className="mb-1 font-medium text-(--lifeops-muted)">{state.title}</p>
      <ul className="flex flex-col gap-0.5">
        {state.rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 whitespace-nowrap">
            <span className="h-0.5 w-3 shrink-0 rounded" style={{ background: row.color }} aria-hidden />
            <span className="font-semibold text-(--lifeops-fg)">{row.value}</span>
            <span className="text-(--lifeops-muted)">{row.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Accessible table behind a chart. `rowKeys` when the first cell can repeat (two asesores with the same name). */
export function DataTable({
  head,
  rows,
  rowKeys,
}: {
  head: string[];
  rows: Array<Array<string | number>>;
  rowKeys?: string[];
}) {
  return (
    <table className="w-full min-w-64 border-collapse text-left text-sm">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={cn(
                "border-b border-(--lifeops-border) py-1.5 pr-3 font-medium text-(--lifeops-muted)",
                i > 0 && "text-right",
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={rowKeys?.[index] ?? `${index}:${row[0]}`}>
            {row.map((cell, i) => (
              <td
                key={i}
                className={cn(
                  "border-b border-(--lifeops-border)/40 py-1.5 pr-3 text-(--lifeops-fg)",
                  i > 0 && "text-right tabular-nums",
                )}
              >
                {typeof cell === "number" ? numberEs.format(cell) : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Clean y-axis ticks (0 … niceMax, up to 4 steps of 1/2/5 × 10^k). Counts: whole steps, so no repeated ticks. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? 10 * magnitude);
  const ticks: number[] = [];
  for (let t = 0; t <= max + step * 0.0001; t += step) ticks.push(Math.round(t));
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** Plot frame with hairline gridlines and y ticks; children are positioned columns. */
export function ColumnPlot({
  ticks,
  height = 176,
  children,
  xLabels,
  tooltip,
}: {
  ticks: number[];
  height?: number;
  children: ReactNode;
  xLabels: string[];
  tooltip: TooltipState;
}) {
  const max = ticks[ticks.length - 1] || 1;
  return (
    <div className="flex gap-2 pt-3">
      <div className="relative w-8 shrink-0 text-right text-xs tabular-nums text-(--lifeops-muted)" style={{ height }}>
        {ticks.map((t) => (
          <span key={t} className="absolute right-0 translate-y-1/2 leading-none" style={{ bottom: `${(t / max) * 100}%` }}>
            {numberEs.format(t)}
          </span>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height }}>
          {ticks.map((t) => (
            <div
              key={t}
              className="absolute inset-x-0 h-px bg-(--viz-grid)"
              style={{ bottom: `${(t / max) * 100}%` }}
              aria-hidden
            />
          ))}
          <div className="absolute inset-0 flex items-end">{children}</div>
          <ChartTooltip state={tooltip} />
        </div>
        <div className="mt-2 flex text-xs text-(--lifeops-muted)">
          {xLabels.map((label) => (
            <span key={label} className="flex-1 truncate text-center">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
