import type { CollectionStatus } from "@/lib/supabase";

/** Days after expected collection date without payment ⇒ policy is at risk. */
export const POLICY_AT_RISK_DAYS = 30;

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
