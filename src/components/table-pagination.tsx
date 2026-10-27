"use client";

import { Button } from "@/components/ui/button";
import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  pageWindow,
  totalPages,
} from "@/lib/pagination";

type Props = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  disabled?: boolean;
  className?: string;
};

export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  disabled = false,
  className = "",
}: Props) {
  const pages = totalPages(total, pageSize);
  const safePage = Math.min(Math.max(1, page), pages);
  const { from, to } = pageWindow(safePage, pageSize, total);
  const canPrev = safePage > 1 && !disabled;
  const canNext = safePage < pages && !disabled;

  return (
    <div
      className={`flex flex-col gap-2 border-t border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}
    >
      <p className="text-xs text-(--lifeops-muted)">
        {total === 0
          ? "Sin resultados"
          : `Mostrando ${from.toLocaleString("es-MX")}–${to.toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-xs text-(--lifeops-muted)">
            <span className="sr-only">Filas por página</span>
            <select
              value={pageSize || DEFAULT_PAGE_SIZE}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded-md border border-(--lifeops-border) bg-(--lifeops-page) px-2 text-xs text-(--lifeops-fg) focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
              aria-label="Filas por página"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size} / pág.
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="text-xs tabular-nums text-(--lifeops-muted)">
          Pág. {safePage} / {pages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canPrev}
          aria-label="Página anterior"
          onClick={() => onPageChange(safePage - 1)}
        >
          Anterior
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!canNext}
          aria-label="Página siguiente"
          onClick={() => onPageChange(safePage + 1)}
        >
          Siguiente
        </Button>
      </div>
    </div>
  );
}
