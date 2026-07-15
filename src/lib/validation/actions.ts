import { z } from "zod";
import {
  consultantCodeSchema,
  emailSchema,
  personNameSchema,
} from "@/lib/validation/schemas";

/** UUID for office ids (auth user id). */
const officeIdSchema = z.string().uuid();

export const inviteConsultantSchema = z.object({
  officeId: officeIdSchema,
  consultantEmail: emailSchema,
  consultantName: personNameSchema,
  consultantCode: consultantCodeSchema,
});

export const officeCleanupSchema = z.object({
  officeId: officeIdSchema,
});
