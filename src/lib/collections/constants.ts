import type { CollectionStatus } from "@/lib/supabase";

export const COLLECTION_STATUS_OPTIONS: {
  value: CollectionStatus;
  label: string;
}[] = [
  { value: "AMPARADO", label: "AMPARADO" },
  { value: "CORRIENTE", label: "CORRIENTE" },
  { value: "FLEXIBLE", label: "FLEXIBLE" },
  { value: "FLEXIBLE_REVISAR", label: "FLEXIBLE/REVISAR" },
  { value: "MES", label: "MES" },
  { value: "PERIODO_GRACIA", label: "PERIODO GRACIA" },
  { value: "ATRASADO", label: "ATRASADO" },
];

export const MONTH_COLUMNS = [
  { month: 1, label: "ENE" },
  { month: 2, label: "FEB" },
  { month: 3, label: "MAR" },
  { month: 4, label: "ABR" },
  { month: 5, label: "MAY" },
  { month: 6, label: "JUN" },
  { month: 7, label: "JUL" },
  { month: 8, label: "AGO" },
  { month: 9, label: "SEP" },
  { month: 10, label: "OCT" },
  { month: 11, label: "NOV" },
  { month: 12, label: "DIC" },
] as const;

export function collectionStatusLabel(
  status: CollectionStatus | null | undefined,
): string {
  if (!status) return "";
  return (
    COLLECTION_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status
  );
}
