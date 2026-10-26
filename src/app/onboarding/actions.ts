"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb, type Db } from "@/lib/db";
import { ONBOARDING_VERSION } from "@/lib/onboarding/options";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import {
  officeOnboardingContactsSchema,
  officeOnboardingOperationSchema,
  officeOnboardingProfileSchema,
} from "@/lib/validation/schemas";

/** Saves onboarding steps; Perfil reuses them to edit the same data later. */

type ActionResult<T = object> =
  | ({ ok: true } & T)
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const INVALID_FORM = "Revisa los datos marcados.";
const SAVE_FAILED = "No se pudo guardar. Intenta de nuevo.";

/** Only promotorías have onboarding; RLS is applied with the caller's JWT. */
async function officeSession(
  accessToken: string,
): Promise<{ ok: true; db: Db } | { ok: false; error: string }> {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false, error: auth.error };
  if (auth.ctx.role !== "promotory") {
    return { ok: false, error: "Solo la promotoría puede editar estos datos." };
  }
  return { ok: true, db: createDb(createUserClient(accessToken)) };
}

/** Postgres errors from the save RPCs → safe Spanish copy. */
function saveError(error: unknown): string {
  const err = error as { code?: string; message?: string };
  const message = err?.message ?? "";
  if (message.includes("agency_code_locked")) {
    return "La clave de promotoría ya no se puede cambiar. Escríbenos si necesitas corregirla.";
  }
  if (message.includes("contacts_required")) {
    return "Primero completa los datos de contacto.";
  }
  if (err?.code === "23503" || err?.code === "23514" || message.includes("_required")) {
    return "Alguna opción no es válida. Revisa tus respuestas.";
  }
  console.error("office onboarding save failed", error);
  return SAVE_FAILED;
}

export async function saveOfficeProfileAction(
  accessToken: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = officeOnboardingProfileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_FORM, fieldErrors: zodFieldErrors(parsed.error) };
  }
  const session = await officeSession(accessToken);
  if (!session.ok) return session;
  try {
    await session.db.officeOnboarding.saveProfile({
      officeName: parsed.data.officeName,
      stateCode: parsed.data.stateCode,
      agencyCode: parsed.data.agencyCode ?? null,
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: saveError(error) };
  }
}

export async function saveOfficeContactsAction(
  accessToken: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = officeOnboardingContactsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_FORM, fieldErrors: zodFieldErrors(parsed.error) };
  }
  const session = await officeSession(accessToken);
  if (!session.ok) return session;
  const isOwner = parsed.data.jobRole === "OWNER";
  try {
    await session.db.officeOnboarding.saveContacts({
      fullName: parsed.data.fullName,
      jobRole: parsed.data.jobRole,
      phone: parsed.data.phone,
      ownerName: isOwner ? null : (parsed.data.ownerName ?? null),
      ownerPhone: isOwner ? null : (parsed.data.ownerPhone ?? null),
    });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: saveError(error) };
  }
}

/** Last step: also marks onboarding complete the first time. */
export async function saveOfficeOperationAction(
  accessToken: string,
  input: unknown,
): Promise<ActionResult<{ completedAt: string }>> {
  const parsed = officeOnboardingOperationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: INVALID_FORM, fieldErrors: zodFieldErrors(parsed.error) };
  }
  const session = await officeSession(accessToken);
  if (!session.ok) return session;
  try {
    const completedAt = await session.db.officeOnboarding.saveOperation({
      insurerCodes: parsed.data.insurerCodes,
      otherInsurer: parsed.data.otherInsurer ?? null,
      lineCodes: parsed.data.lineCodes,
      consultantCountRange: parsed.data.consultantCountRange,
      activePolicyRange: parsed.data.activePolicyRange,
      primaryGoal: parsed.data.primaryGoal ?? null,
      version: ONBOARDING_VERSION,
    });
    return { ok: true, completedAt };
  } catch (error) {
    return { ok: false, error: saveError(error) };
  }
}
