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
  value: string;
  detail?: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-(--lifeops-muted)">{label}</p>
        <Icon className="h-4 w-4 shrink-0 text-(--lifeops-muted)" aria-hidden />
      </div>
      <p className="text-3xl font-semibold text-(--lifeops-fg)">{value}</p>
      {detail ? <div className="text-xs text-(--lifeops-muted)">{detail}</div> : null}
    </div>
  );
}
