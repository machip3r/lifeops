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
      className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 ${className}`}
    >
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {total === 0
          ? "Sin resultados"
          : `Mostrando ${from.toLocaleString("es-MX")}–${to.toLocaleString("es-MX")} de ${total.toLocaleString("es-MX")}`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <span className="sr-only">Filas por página</span>
            <select
              value={pageSize || DEFAULT_PAGE_SIZE}
              disabled={disabled}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#FBDBAC]"
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
        <span className="text-sm text-gray-600 dark:text-gray-400 tabular-nums">
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
