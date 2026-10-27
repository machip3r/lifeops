import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** KPI tile: label · value · supporting line. Values use proportional figures. */
export function StatTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs leading-tight text-(--lifeops-muted)">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-(--lifeops-muted)" aria-hidden />
      </div>
      <div className="text-2xl font-semibold tracking-tight tabular-nums text-(--lifeops-fg)">{value}</div>
      {detail ? <div className="truncate text-[11px] leading-tight text-(--lifeops-muted)">{detail}</div> : null}
    </div>
  );
}
