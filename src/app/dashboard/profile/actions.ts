"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb } from "@/lib/db";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import { updateOwnNameSchema } from "@/lib/validation/schemas";

/** Asesor renames itself (Perfil), with `consultant.update` audit. */
export async function updateOwnNameAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (auth.ctx.role !== "consultant" || !auth.ctx.consultantId) {
    return { ok: false as const, error: "Solo un asesor puede editar este dato." };
  }

  const parsed = updateOwnNameSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Revisa tu nombre.",
      fieldErrors: zodFieldErrors(parsed.error, undefined, { name: "consultantName" }),
    };
  }

  try {
    await createDb(createUserClient(accessToken)).consultant.updateOwnNameWithAudit(
      auth.ctx.consultantId,
      parsed.data.name,
      { userId: auth.ctx.user.id, officeId: auth.ctx.officeId, role: auth.ctx.role },
    );
    return { ok: true as const };
  } catch (error) {
    console.error("updateOwnNameAction:", error);
    return { ok: false as const, error: "No se pudo guardar tu nombre. Intenta de nuevo." };
  }
}
