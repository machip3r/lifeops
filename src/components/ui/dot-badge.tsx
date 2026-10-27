import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Pill with a colored dot + label in ink (status chips). Color never carries meaning alone. */
export function DotBadge({
  label,
  color,
  extra,
  className,
}: {
  label: string;
  color: string;
  /** Muted suffix, e.g. "· 12 d" */
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-(--lifeops-border) px-2 py-0.5 text-xs font-medium text-(--lifeops-fg)",
        className,
      )}
    >
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {label}
      {extra ? <span className="text-(--lifeops-muted)">{extra}</span> : null}
    </span>
  );
}
