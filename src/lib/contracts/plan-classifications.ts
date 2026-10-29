/**
 * «Clasificación del plan» as Seguros Monterrey writes it in the Mina de Oro (stored as-is, so the
 * import and manual registration compare equal): vida → TRADICIONAL / FLEXIBLE, GMM, AP.
 */
export const PLAN_CLASSIFICATION_OPTIONS = ["TRADICIONAL", "FLEXIBLE", "GMM", "AP"] as const;

export const PLAN_CLASSIFICATION_LABELS: Record<string, string> = {
  TRADICIONAL: "Tradicional",
  FLEXIBLE: "Flexible",
  GMM: "Gastos médicos (GMM)",
  AP: "Accidentes personales (AP)",
};

export function planClassificationLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return PLAN_CLASSIFICATION_LABELS[value.trim().toUpperCase()] ?? value;
}
