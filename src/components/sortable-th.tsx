"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/lib/table-sort";

type Props = {
  label: string;
  active: boolean;
  dir: SortDir;
  onSort: () => void;
  className?: string;
};

export function SortableTh({ label, active, dir, onSort, className = "" }: Props) {
  return (
    <th
      className={`px-3 py-3 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap ${className}`.trim()}
      scope="col"
    >
      <button
        type="button"
        onClick={onSort}
        className="inline-flex items-center gap-1 uppercase tracking-wider text-inherit hover:text-[#FBDBAC] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] rounded"
        aria-label={
          active
            ? `Ordenar por ${label}, actualmente ${dir === "asc" ? "ascendente" : "descendente"}`
            : `Ordenar por ${label}`
        }
      >
        {label}
        {active ? (
          dir === "asc" ? (
            <ArrowUp className="size-3.5 shrink-0" aria-hidden />
          ) : (
            <ArrowDown className="size-3.5 shrink-0" aria-hidden />
          )
        ) : (
          <ArrowUpDown className="size-3.5 shrink-0 opacity-50" aria-hidden />
        )}
      </button>
    </th>
  );
}
