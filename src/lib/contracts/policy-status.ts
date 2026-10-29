/**
 * Póliza status as the insurer reports it (`contract.status`). Only `IN_FORCE` is in cobranza;
 * an `ANNULLED` póliza can be rehabilitated (back to `IN_FORCE`).
 */
export const POLICY_STATUSES = ["IN_FORCE", "EXTENDED", "NO_PREMIUMS", "ANNULLED"] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const POLICY_STATUS: Record<PolicyStatus, { label: string; plural: string; description: string; color: string }> = {
  IN_FORCE: {
    label: "En vigor",
    plural: "En vigor",
    description: "Genera cobros: está en cobranza, al corriente o atrasada.",
    color: "var(--viz-current)",
  },
  EXTENDED: {
    label: "En vigor prorrogado",
    plural: "Prorrogadas",
    description: "Sigue vigente sin pagar primas (seguro prorrogado). No entra en cobranza.",
    color: "var(--viz-due-soon)",
  },
  NO_PREMIUMS: {
    label: "En vigor sin pago de primas",
    plural: "Sin pago de primas",
    description: "Vigente sin primas por pagar. No entra en cobranza.",
    color: "var(--lifeops-muted)",
  },
  ANNULLED: {
    label: "Anulada",
    plural: "Anuladas",
    description: "No entra en cobranza. Se puede rehabilitar.",
    color: "var(--viz-last-year)",
  },
};

/** Only pólizas en vigor have receipts to collect. */
export function isInForce(status: string | null | undefined): boolean {
  return status === "IN_FORCE";
}

export function isPolicyStatus(value: unknown): value is PolicyStatus {
  return typeof value === "string" && (POLICY_STATUSES as readonly string[]).includes(value);
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Insurer / plantilla text → status: «En Vigor» / «Vigente» → IN_FORCE, «… prorrogado» → EXTENDED,
 * «… sin pago de primas» → NO_PREMIUMS, «Anulada» / «Cancelada» → ANNULLED. Empty → IN_FORCE;
 * anything else written is not collectable → ANNULLED.
 */
export function policyStatusFromText(value: unknown): PolicyStatus {
  const text = fold(String(value ?? ""));
  if (!text) return "IN_FORCE";
  if (/anulad|cancelad|inactiv/.test(text)) return "ANNULLED";
  if (text.includes("prorrog")) return "EXTENDED";
  if (text.includes("sin pago")) return "NO_PREMIUMS";
  if (/^(en vigor|vigente|vigor|activa|activo)$/.test(text)) return "IN_FORCE";
  return "ANNULLED";
}
