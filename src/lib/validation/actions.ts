import { z } from "zod";
import {
  consultantCodeSchema,
  consultantDisplayNameSchema,
  emailSchema,
} from "@/lib/validation/schemas";

/** UUID for office ids (auth user id). */
const officeIdSchema = z.string().uuid();

export const inviteConsultantSchema = z.object({
  officeId: officeIdSchema,
  consultantEmail: emailSchema,
  consultantName: consultantDisplayNameSchema,
  consultantCode: consultantCodeSchema,
  /** When set, resets prior Auth/invite state for that asesor before sending. */
  consultantId: z.string().uuid().optional(),
});

export const officeCleanupSchema = z.object({
  officeId: officeIdSchema,
});
