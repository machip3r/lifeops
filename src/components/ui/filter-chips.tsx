"use client";

import { cn } from "@/lib/utils";

export type FilterChip<T extends string> = {
  value: T;
  label: string;
  count?: number;
  /** Optional color dot (e.g. a status color token) */
  color?: string;
};

/** One-row toggle chips for list filters (single selection). */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: Array<FilterChip<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group */
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]",
              active
                ? "border-(--lifeops-accent) bg-(--lifeops-hover) font-medium text-(--lifeops-fg)"
                : "border-(--lifeops-border) text-(--lifeops-muted) hover:bg-(--lifeops-hover)/60 hover:text-(--lifeops-fg)",
            )}
          >
            {option.color ? (
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: option.color }} aria-hidden />
            ) : null}
            {option.label}
            {option.count != null ? (
              <span className="tabular-nums text-(--lifeops-muted)">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
