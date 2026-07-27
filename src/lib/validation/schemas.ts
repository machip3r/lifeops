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
  tagName: 40,
  notes: 2000,
  currency: 16,
  documentDisplayName: 120,
  documentFileBytes: 20 * 1024 * 1024,
  changeDetails: 4000,
  folioNumber: 64,
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

/** Tag labels — letters, numbers, spaces, safe punctuation; no angle brackets. */
export const TAG_NAME_PATTERN =
  /^(?!.*[<>])[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}\s.&'+_/\-()]*[\p{L}\p{M}\p{N}.])?$/u;

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

export const tagNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.tagName)
  .regex(TAG_NAME_PATTERN);

export const tagSectionSchema = z.enum(['consultant', 'client']);

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

export const COLLECTION_STATUSES = [
  "AMPARADO",
  "CORRIENTE",
  "FLEXIBLE",
  "FLEXIBLE_REVISAR",
  "MES",
  "PERIODO_GRACIA",
  "ATRASADO",
] as const;

export const collectionStatusSchema = z.enum(COLLECTION_STATUSES);

export const collectionYearSchema = z.coerce
  .number()
  .int()
  .min(2000)
  .max(2100);

export const collectionMonthSchema = z.coerce.number().int().min(1).max(12);

export const collectionDaySchema = z.coerce.number().int().min(1).max(31);

export const uuidSchema = z
  .string()
  .trim()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );

export const isoDateRequiredSchema = z
  .string()
  .trim()
  .regex(ISO_DATE_PATTERN);

export const updateCollectionStatusSchema = z.object({
  contractId: uuidSchema,
  status: collectionStatusSchema,
});

export const updateCollectionDaySchema = z.object({
  contractId: uuidSchema,
  collectionDay: collectionDaySchema.nullable(),
});

/** Medio de cobro — short label (e.g. C.A); empty clears. */
export const PAYMENT_CHANNEL_PATTERN =
  /^(?!.*[<>])[\p{L}\p{M}\p{N}.\s/_-]{1,64}$/u;

export const updatePaymentChannelSchema = z.object({
  contractId: uuidSchema,
  paymentChannel: z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.union([z.string().max(64).regex(PAYMENT_CHANNEL_PATTERN), z.null()])),
});

export const updateProjectNameSchema = z.object({
  contractId: uuidSchema,
  projectName: z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.union([z.string().max(LIMITS.entityName).regex(ENTITY_NAME_PATTERN), z.null()])),
});

export const upsertCollectionPaymentSchema = z.object({
  contractId: uuidSchema,
  year: collectionYearSchema,
  month: collectionMonthSchema,
  paidAt: isoDateRequiredSchema,
  scheduledDay: collectionDaySchema.optional().nullable(),
  amount: z.preprocess((value) => {
    if (value === "" || value === undefined) return null;
    return value;
  }, z.union([z.coerce.number().finite().min(0).max(1_000_000_000), z.null()])),
  notes: z.preprocess((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }, z.union([z.string().max(LIMITS.notes).regex(MESSAGE_PATTERN), z.null()])),
});

export const clearCollectionPaymentSchema = z.object({
  contractId: uuidSchema,
  year: collectionYearSchema,
  month: collectionMonthSchema,
});

export const getCollectionsGridSchema = z.object({
  year: collectionYearSchema,
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(25),
});

export const getCollectionAuditLogSchema = z.object({
  contractId: uuidSchema.optional().nullable(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/** User-facing document label on solicitud attachments. */
export const DOCUMENT_DISPLAY_NAME_PATTERN =
  /^(?!.*[<>])[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}\s.&'+_/\-()]*[\p{L}\p{M}\p{N}.])?$/u;

export const documentDisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.documentDisplayName)
  .regex(DOCUMENT_DISPLAY_NAME_PATTERN);

export const DOCUMENT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const documentMimeTypeSchema = z.enum(DOCUMENT_ALLOWED_MIME_TYPES);

export const folioNumberSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.folioNumber)
  .regex(CONTRACT_NUMBER_PATTERN);

export const changeDetailsSchema = z
  .string()
  .trim()
  .min(1)
  .max(LIMITS.changeDetails)
  .regex(MESSAGE_PATTERN);

export const CHANGE_TYPE_OPTIONS = [
  "Cambio Agente",
  "Forma de pago",
  "Domicilio",
  "Contratante",
  "Disminución de SA",
  "Inclusión/exclusión de coberturas",
  "Corrección de Nombre, Sexo, Fecha de nacimiento, etc.",
  "Rehabilitación primeros 90 días",
  "Alta/Cambio/Baja de Cargo Automático",
  "Otro",
] as const;

export const changeTypeSchema = z.enum(CHANGE_TYPE_OPTIONS);

export const documentUploadMetaSchema = z.object({
  contractId: uuidSchema,
  changeRequestId: uuidSchema.optional().nullable(),
  displayName: documentDisplayNameSchema,
});

export const emitSolicitudSchema = z.object({
  clientId: uuidSchema.optional().nullable(),
  clientName: personNameSchema.optional(),
  projectName: entityNameSchema.optional().nullable(),
  contractNumber: contractNumberSchema.optional().nullable(),
  notes: notesSchema.optional().nullable(),
}).refine((v) => Boolean(v.clientId) || Boolean(v.clientName), {
  message: "required",
  path: ["clientName"],
});

export const changeSolicitudSchema = z.object({
  contractId: uuidSchema,
  changeType: changeTypeSchema,
  otherChangeType: z
    .string()
    .trim()
    .max(LIMITS.entityName)
    .regex(ENTITY_NAME_PATTERN)
    .optional()
    .nullable(),
  folioNumber: folioNumberSchema.optional().nullable(),
  details: changeDetailsSchema,
  notes: notesSchema.optional().nullable(),
}).superRefine((v, ctx) => {
  if (v.changeType === "Otro" && !v.otherChangeType?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "required",
      path: ["otherChangeType"],
    });
  }
});

export const correctSolicitudSchema = z.object({
  contractId: uuidSchema,
  folioNumber: folioNumberSchema,
  details: changeDetailsSchema,
  notes: notesSchema.optional().nullable(),
});
