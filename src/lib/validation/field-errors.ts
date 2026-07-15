import type { ZodError, ZodIssue } from "zod";

/** Shared Spanish validation copy for forms. */
export type ValidationMessages = {
  required: string;
  email: string;
  password: string;
  passwordMin: string;
  passwordMismatch: string;
  personName: string;
  entityName: string;
  otp: string;
  date: string;
  contractNumber: string;
  consultantCode: string;
  notes: string;
  invalid: string;
};

export const VALIDATION_MESSAGES: ValidationMessages = {
  required: "Este campo es obligatorio.",
  email: "Ingresa un correo electrónico válido.",
  password: "La contraseña contiene caracteres no permitidos.",
  passwordMin: "La contraseña debe tener al menos 8 caracteres.",
  passwordMismatch: "Las contraseñas no coinciden.",
  personName: "Ingresa un nombre válido.",
  entityName: "Ingresa un nombre válido.",
  otp: "Ingresa el código de 6 dígitos.",
  date: "Ingresa una fecha válida (AAAA-MM-DD).",
  contractNumber: "Ingresa un número de póliza válido.",
  consultantCode: "Ingresa un código de asesor válido.",
  notes: "El texto contiene caracteres no permitidos.",
  invalid: "El valor no es válido.",
};

const FIELD_KIND: Record<string, keyof ValidationMessages> = {
  email: "email",
  password: "password",
  confirmPassword: "password",
  name: "personName",
  otp: "otp",
  birth_date: "date",
  birthDate: "date",
  contract_number: "contractNumber",
  contractNumber: "contractNumber",
  consultant_code: "consultantCode",
  consultantCode: "consultantCode",
  notes: "notes",
  details: "notes",
};

/** Map Zod issues to per-field Spanish messages. */
export function zodFieldErrors(
  error: ZodError,
  messages: ValidationMessages = VALIDATION_MESSAGES,
  fieldKindOverrides?: Partial<Record<string, keyof ValidationMessages>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (!key || out[key]) continue;
    out[key] = messageForIssue(key, issue, messages, fieldKindOverrides);
  }
  return out;
}

function messageForIssue(
  field: string,
  issue: ZodIssue,
  messages: ValidationMessages,
  overrides?: Partial<Record<string, keyof ValidationMessages>>,
): string {
  if (issue.message === "mismatch") return messages.passwordMismatch;
  if (issue.message === "date") return messages.date;

  if (issue.code === "too_small" && issue.origin === "string") {
    if (issue.minimum === 1) return messages.required;
    if (field === "password" || field === "confirmPassword") {
      return messages.passwordMin;
    }
  }

  const kind = overrides?.[field] ?? FIELD_KIND[field] ?? "invalid";
  return messages[kind];
}
