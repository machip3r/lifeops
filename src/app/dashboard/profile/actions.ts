"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb } from "@/lib/db";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import { updateOwnNameSchema } from "@/lib/validation/schemas";
import { createPromotoryRegistrationTokenAdmin } from "@/lib/db-admin";

export async function canCreatePromotoryRegistrationLinkAction(accessToken: string) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return false;
  const allowedEmail = process.env.PROMOTORY_INVITE_GENERATOR_EMAIL?.trim().toLowerCase();
  return Boolean(allowedEmail && auth.ctx.role === "promotory" && auth.ctx.user.email?.toLowerCase() === allowedEmail);
}

/** Create an expiring promotoría registration link for the configured operator only. */
export async function createPromotoryRegistrationLinkAction(accessToken: string) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const allowedEmail = process.env.PROMOTORY_INVITE_GENERATOR_EMAIL?.trim().toLowerCase();
  if (!allowedEmail || auth.ctx.role !== "promotory" || auth.ctx.user.email?.toLowerCase() !== allowedEmail) {
    return { ok: false as const, error: "No tienes permiso para crear estos enlaces." };
  }

  const baseUrl = process.env.APP_BASE_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!baseUrl) {
    return { ok: false as const, error: "Falta configurar la dirección pública de LifeOps." };
  }

  try {
    const invitation = await createPromotoryRegistrationTokenAdmin(auth.ctx.user.id);
    const link = new URL("/register", baseUrl);
    link.searchParams.set("token", invitation.token);
    return { ok: true as const, link: link.toString(), expiresAt: invitation.expiresAt };
  } catch (error) {
    console.error("createPromotoryRegistrationLinkAction:", error);
    return { ok: false as const, error: "No se pudo crear el enlace. Intenta de nuevo." };
  }
}

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
