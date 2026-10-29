/**
 * Póliza registry import (Mina de Oro de Seguros Monterrey / plantilla LifeOps): one row per
 * póliza, no payments. Shared by the browser parser and the server import (pure functions).
 */
import { normalizeClientName } from "@/lib/clients/name-match";
import { normalizePaymentMethod } from "@/lib/extractor/import/parse";
import { normalizeContractNumber } from "@/lib/contracts/contract-number";
import { POLICY_STATUS, isPolicyStatus, policyStatusFromText, type PolicyStatus } from "@/lib/contracts/policy-status";

export type RegistrySource = "mina_de_oro" | "template";

export type RegistryRow = {
  /** Row number in the file (1-based, for messages) */
  index: number;
  contractNumber: string;
  clientName: string;
  consultantCode: string;
  consultantName: string | null;
  /** YYYY-MM-DD */
  issueDate: string | null;
  /** Anual / Semestral / Trimestral / Mensual */
  paymentMethod: string | null;
  /** Conducto de cobro (AGENTE, TDD, cargo a tarjeta…) */
  paymentChannel: string | null;
  /** Plan / producto */
  projectName: string | null;
  lineCode: "LIFE" | "HEALTH" | null;
  planClassification: string | null;
  insuredName: string | null;
  status: PolicyStatus;
  currency: "PESO" | "DOLAR" | "UDI" | null;
  /** In the póliza currency (kept as text like today) */
  annualPremium: string | null;
  insuredAmount: string | null;
  annualPremiumMxn: number | null;
  insuredAmountMxn: number | null;
  deductibleMxn: number | null;
  endDate: string | null;
  collectionDay: number | null;
  clientEmail: string | null;
  /** 10 digits */
  clientPhone: string | null;
  clientBirthDate: string | null;
  clientMaritalStatus: string | null;
  clientRfc: string | null;
  clientCurp: string | null;
};

/** Fields compared with LifeOps: `contract` / `client` columns, or `link` (asesor / contratante). */
export const REGISTRY_FIELDS = {
  consultantCode: { label: "Asesor (clave)", target: "link" },
  clientName: { label: "Contratante", target: "link" },
  issueDate: { label: "Fecha de emisión", target: "contract", column: "issue_date", kind: "date" },
  paymentMethod: { label: "Forma de pago", target: "contract", column: "payment_method" },
  paymentChannel: { label: "Conducto de cobro", target: "contract", column: "payment_channel" },
  projectName: { label: "Plan", target: "contract", column: "project_name" },
  lineCode: { label: "Ramo", target: "contract", column: "line_code" },
  planClassification: { label: "Clasificación del plan", target: "contract", column: "plan_classification" },
  insuredName: { label: "Asegurado principal", target: "contract", column: "insured_name" },
  status: { label: "Estatus de la póliza", target: "contract", column: "status" },
  currency: { label: "Moneda", target: "contract", column: "currency" },
  annualPremium: { label: "Prima anual", target: "contract", column: "annual_premium", kind: "number" },
  insuredAmount: { label: "Suma asegurada", target: "contract", column: "insured_amount", kind: "number" },
  annualPremiumMxn: { label: "Prima anual (pesos)", target: "contract", column: "annual_premium_mxn", kind: "number" },
  insuredAmountMxn: { label: "Suma asegurada (pesos)", target: "contract", column: "insured_amount_mxn", kind: "number" },
  deductibleMxn: { label: "Deducible (pesos)", target: "contract", column: "deductible_mxn", kind: "number" },
  endDate: { label: "Fin de vigencia", target: "contract", column: "end_date", kind: "date" },
  collectionDay: { label: "Día de cobro", target: "contract", column: "collection_day", kind: "number" },
  clientEmail: { label: "Correo del cliente", target: "client", column: "email" },
  clientPhone: { label: "Teléfono del cliente", target: "client", column: "phone" },
  clientBirthDate: { label: "Nacimiento del cliente", target: "client", column: "birth_date", kind: "date" },
  clientMaritalStatus: { label: "Estado civil", target: "client", column: "marital_status" },
  clientRfc: { label: "RFC", target: "client", column: "rfc" },
  clientCurp: { label: "CURP", target: "client", column: "curp" },
} as const satisfies Record<
  string,
  { label: string; target: "contract" | "client" | "link"; column?: string; kind?: "date" | "number" }
>;

export type RegistryField = keyof typeof REGISTRY_FIELDS;

const LINE_LABEL: Record<string, string> = { LIFE: "Vida", HEALTH: "Gastos médicos" };
const CURRENCY_LABEL: Record<string, string> = { PESO: "Pesos", DOLAR: "Dólares", UDI: "UDI" };

/** Human value for the review table. */
export function displayRegistryValue(field: RegistryField, value: unknown): string {
  if (value == null || value === "") return "—";
  if (field === "status") return isPolicyStatus(value) ? POLICY_STATUS[value].label : String(value);
  if (field === "lineCode") return LINE_LABEL[String(value)] ?? String(value);
  if (field === "currency") return CURRENCY_LABEL[String(value)] ?? String(value);
  const meta = REGISTRY_FIELDS[field] as { kind?: string };
  if (meta.kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }
  if (meta.kind === "number") {
    const n = Number(String(value).replace(/[$,\s]/g, ""));
    if (Number.isFinite(n)) return n.toLocaleString("es-MX", { maximumFractionDigits: 2 });
  }
  return String(value);
}

const fold = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Same value for review purposes (numbers by amount, names / text without accents or case). */
export function sameRegistryValue(field: RegistryField, current: unknown, incoming: unknown): boolean {
  const empty = (v: unknown) => v == null || String(v).trim() === "";
  if (empty(current) && empty(incoming)) return true;
  if (empty(current) || empty(incoming)) return false;
  const meta = REGISTRY_FIELDS[field] as { kind?: string };
  if (meta.kind === "number") {
    const a = Number(String(current).replace(/[$,\s]/g, ""));
    const b = Number(String(incoming).replace(/[$,\s]/g, ""));
    if (Number.isFinite(a) && Number.isFinite(b)) return Math.abs(a - b) < 0.005;
  }
  if (meta.kind === "date") return String(current).slice(0, 10) === String(incoming).slice(0, 10);
  if (field === "clientName") return normalizeClientName(String(current)) === normalizeClientName(String(incoming));
  return fold(String(current)) === fold(String(incoming));
}

// ---- Cell normalizers (file → RegistryRow) ----------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");

/** Date objects (xlsx), DD-MM-YYYY, DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD. */
export function toIsoDate(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // xlsx dates come as UTC midnight
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  const dmy = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(text);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    if (date.getUTCMonth() !== Number(m) - 1) return null;
    return `${y}-${pad(Number(m))}-${pad(Number(d))}`;
  }
  return null;
}

export function toAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  const text = String(value ?? "").replace(/[$,\s]/g, "");
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function toText(value: unknown, max: number): string | null {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

export function toPhone(value: unknown): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export function toEmail(value: unknown): string | null {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) && text.length <= 254 ? text : null;
}

export function toPaymentMethod(value: unknown): string | null {
  const text = toText(value, 40);
  if (!text) return null;
  const normalized = normalizePaymentMethod(text);
  return normalized && ["Anual", "Semestral", "Trimestral", "Mensual"].includes(normalized) ? normalized : null;
}

/** "VIDA INDIVIDUAL" / "GASTOS MEDICOS…" / "GMM" → ramo; falls back to the póliza prefix (VI / GM). */
export function toLineCode(value: unknown, contractNumber: string): RegistryRow["lineCode"] {
  const text = fold(String(value ?? ""));
  if (text.startsWith("vida") || text === "vi") return "LIFE";
  if (text.includes("gastos") || text.includes("medic") || text === "gmm" || text === "gm") return "HEALTH";
  const prefix = contractNumber.slice(0, 2).toUpperCase();
  if (prefix === "VI") return "LIFE";
  if (prefix === "GM") return "HEALTH";
  return null;
}

/** Insurer «Estatus» → póliza status (see `policyStatusFromText`). */
export function toStatus(value: unknown): RegistryRow["status"] {
  return policyStatusFromText(value);
}

export function toCurrency(value: unknown): RegistryRow["currency"] {
  const text = fold(String(value ?? ""));
  if (!text) return null;
  if (text.includes("udi")) return "UDI";
  if (text.includes("dolar") || text.includes("usd")) return "DOLAR";
  if (text.includes("peso") || text === "mxn" || text === "mn") return "PESO";
  return null;
}

export function toContractNumber(value: unknown): string {
  return normalizeContractNumber(value).slice(0, 64);
}

export function toTaxId(value: unknown, length: number[]): string | null {
  const text = String(value ?? "").toUpperCase().replace(/[^A-ZÑ&0-9]/g, "");
  return length.includes(text.length) ? text : null;
}
