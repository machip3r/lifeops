/**
 * Single-choice onboarding answers: codes are stored on `office` / `office_contact`
 * (CHECK-constrained in migration 027); labels are Spanish UI copy.
 * Multi-choice catalogs (aseguradoras, ramos, estados) live in the database.
 */

/** Bump when onboarding gains required questions; offices below it can be asked again. */
export const ONBOARDING_VERSION = 1;

export const JOB_ROLES = ["OWNER", "DIRECTOR", "OPERATIONS_MANAGER", "ASSISTANT", "OTHER"] as const;
export type JobRole = (typeof JOB_ROLES)[number];
export const JOB_ROLE_OPTIONS: Array<{ value: JobRole; label: string }> = [
  { value: "OWNER", label: "Dueño(a)" },
  { value: "DIRECTOR", label: "Director(a)" },
  { value: "OPERATIONS_MANAGER", label: "Gerente de operaciones" },
  { value: "ASSISTANT", label: "Asistente o administrativo" },
  { value: "OTHER", label: "Otro" },
];

export const CONSULTANT_COUNT_RANGES = ["1_5", "6_20", "21_50", "51_100", "100_PLUS"] as const;
export type ConsultantCountRange = (typeof CONSULTANT_COUNT_RANGES)[number];
export const CONSULTANT_COUNT_RANGE_OPTIONS: Array<{ value: ConsultantCountRange; label: string }> = [
  { value: "1_5", label: "1 a 5" },
  { value: "6_20", label: "6 a 20" },
  { value: "21_50", label: "21 a 50" },
  { value: "51_100", label: "51 a 100" },
  { value: "100_PLUS", label: "Más de 100" },
];

export const ACTIVE_POLICY_RANGES = ["LT_100", "100_500", "500_2000", "2000_10000", "GT_10000"] as const;
export type ActivePolicyRange = (typeof ACTIVE_POLICY_RANGES)[number];
export const ACTIVE_POLICY_RANGE_OPTIONS: Array<{ value: ActivePolicyRange; label: string }> = [
  { value: "LT_100", label: "Menos de 100" },
  { value: "100_500", label: "100 a 500" },
  { value: "500_2000", label: "500 a 2,000" },
  { value: "2000_10000", label: "2,000 a 10,000" },
  { value: "GT_10000", label: "Más de 10,000" },
];

export const PRIMARY_GOALS = ["COLLECTIONS", "COMMISSIONS", "CONSULTANTS", "ALL"] as const;
export type PrimaryGoal = (typeof PRIMARY_GOALS)[number];
export const PRIMARY_GOAL_OPTIONS: Array<{ value: PrimaryGoal; label: string }> = [
  { value: "COLLECTIONS", label: "Cobranza" },
  { value: "COMMISSIONS", label: "Comisiones" },
  { value: "CONSULTANTS", label: "Control de asesores" },
  { value: "ALL", label: "Todo" },
];

/** Catalog code that requires a free-text name (aseguradora "Otra"). */
export const OTHER_CODE = "OTHER";

/** The only aseguradora LifeOps supports today (commission import, cobranza from its reports). */
const SUPPORTED_INSURER_CODE = "MONTERREY_NYL";

/** Seguros Monterrey promotorías can load their cartera (Mina de Oro / plantilla) right away. */
export function worksWithMonterrey(insurerCodes: string[]): boolean {
  return insurerCodes.includes(SUPPORTED_INSURER_CODE);
}

/** True when the promotoría picked aseguradoras but none LifeOps supports yet. */
export function lacksSupportedInsurer(insurerCodes: string[]): boolean {
  return insurerCodes.length > 0 && !insurerCodes.includes(SUPPORTED_INSURER_CODE);
}
