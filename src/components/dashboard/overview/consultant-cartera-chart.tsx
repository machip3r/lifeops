"use client";

import { useState } from "react";
import type { CollectionOverview } from "@/lib/supabase";
import { CARTERA_STATES, StatusStack, carteraWithData } from "./cartera-status";
import { ChartCard, ChartLegend, ChartTooltip, DataTable, numberEs, type TooltipState } from "./chart-parts";

const MAX_ROWS = 8;

/** Cartera per asesor (absolute length), sorted by vencidas + en peligro. */
export function ConsultantCarteraChart({
  rows,
  className,
}: {
  rows: CollectionOverview["by_consultant"];
  className?: string;
}) {
  const [tip, setTip] = useState<{ index: number; state: TooltipState } | null>(null);
  const shown = rows.slice(0, MAX_ROWS);
  const scale = Math.max(1, ...shown.map((r) => carteraWithData(r)));

  return (
    <ChartCard
      className={className}
      title="Cartera por asesor"
      subtitle={
        rows.length > MAX_ROWS
          ? `Los ${MAX_ROWS} asesores con más pólizas vencidas o en peligro (de ${rows.length})`
          : "Pólizas activas por estado, ordenadas por vencidas y en peligro"
      }
      legend={<ChartLegend items={CARTERA_STATES.map((s) => ({ label: s.label, color: s.color }))} />}
      table={
        <DataTable
          head={["Asesor", ...CARTERA_STATES.map((s) => s.label), "Sin pagos"]}
          rows={rows.map((r) => [r.name, ...CARTERA_STATES.map((s) => r[s.key]), r.no_payment])}
        />
      }
    >
      <ul className="flex flex-col gap-3">
        {shown.map((row, index) => (
          <li key={row.consultant_id} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-(--lifeops-fg) sm:w-40" title={row.name}>
              {row.name}
            </span>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div className="relative min-w-0 flex-1">
                {tip?.index === index ? <ChartTooltip state={tip.state} above /> : null}
                <StatusStack
                  counts={row}
                  scaleTotal={scale}
                  height="h-4"
                  title={row.name}
                  onTooltip={(state) => setTip(state ? { index, state } : null)}
                />
              </div>
              <span className="shrink-0 text-xs tabular-nums text-(--lifeops-muted)">
                {numberEs.format(carteraWithData(row))}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </ChartCard>
  );
}
