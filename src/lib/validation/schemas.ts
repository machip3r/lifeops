import { z } from "zod";

/** Shared limits — keep form `maxLength` in sync with these. */
export const LIMITS = {
  email: 254,
  password: { min: 8, max: 128 },
  personName: 120,
  entityName: 120,
  otp: { min: 6, max: 6 },
  search: 100,
  contractNumber: 64,
  consultantCode: 64,
  notes: 2000,
  currency: 16,
} as const;

/** Lowercase email local+domain shape (after trim + lowercasing). */
export const EMAIL_PATTERN =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Letters (incl. accents), spaces, apostrophe, hyphen, period. */
export const PERSON_NAME_PATTERN =
  /^[\p{L}\p{M}](?:[\p{L}\p{M}\s'.-]*[\p{L}\p{M}.])?$/u;

/** Office / project labels — no angle brackets or control chars. */
export const ENTITY_NAME_PATTERN =
  /^(?!.*[<>])[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}\s.&'+_/\-()]*[\p{L}\p{M}\p{N}.])?$/u;

/** Printable password chars only (no control characters). */
export const PASSWORD_PATTERN = /^[\x20-\x7E]+$/;

/** Signup / email OTP tokens (6 digits). */
export const OTP_PATTERN = /^\d{6}$/;

/** HTML date input value. */
export const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Free text — allow newlines/tabs, reject other controls. */
export const MESSAGE_PATTERN = /^[^\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+$/;

/** Poliza / folio style identifiers. */
export const CONTRACT_NUMBER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/\-]*$/;

/** Asesor code from HTML import. */
export const CONSULTANT_CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._\-]*$/;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(LIMITS.email)
  .regex(EMAIL_PATTERN);

export const passwordSchema = z
  .string()
  .min(LIMITS.password.min)
  .max(LIMITS.password.max)
  .regex(PASSWORD_PATTERN);

/** Login only: length-bounded, no control chars (do not enforce min strength on login). */
export const loginPasswordSchema = z
  .string()
  .min(1)
  .max(LIMITS.password.max)
  .regex(PASSWORD_PATTERN);

export const personNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.personName)
  .regex(PERSON_NAME_PATTERN);

export const entityNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.entityName)
  .regex(ENTITY_NAME_PATTERN);

export const otpSchema = z
  .string()
  .trim()
  .min(LIMITS.otp.min)
  .max(LIMITS.otp.max)
  .regex(OTP_PATTERN);

export const optionalIsoDateSchema = z
  .string()
  .trim()
  .refine((v) => v.length === 0 || ISO_DATE_PATTERN.test(v), {
    message: "date",
  })
  .transform((v) => (v.length === 0 ? null : v));

export const contractNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.contractNumber)
  .regex(CONTRACT_NUMBER_PATTERN);

export const consultantCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.consultantCode)
  .regex(CONSULTANT_CODE_PATTERN);

export const notesSchema = z
  .string()
  .trim()
  .max(LIMITS.notes)
  .regex(MESSAGE_PATTERN);

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const signupSchema = z.object({
  name: personNameSchema,
  email: emailSchema,
  password: passwordSchema,
});

export const otpVerifySchema = z.object({
  email: emailSchema,
  otp: otpSchema,
});
