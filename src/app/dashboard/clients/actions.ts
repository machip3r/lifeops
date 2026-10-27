"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb } from "@/lib/db";
import { deleteClientCascadeAdmin } from "@/lib/db-admin";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import { deleteClientSchema, updateClientSchema } from "@/lib/validation/schemas";

/** Full client edit with `client.update` audit (RLS decides who may edit it). */
export async function updateClientAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsed = updateClientSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Revisa los datos marcados.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const { clientId, ...v } = parsed.data;
  const db = createDb(createUserClient(accessToken));
  try {
    return await db.client.updateWithAudit(
      clientId,
      {
        name: v.name,
        birth_date: v.birthDate,
        curp: v.curp ?? null,
        rfc: v.rfc ?? null,
        phone: v.phone ?? null,
        email: v.email ?? null,
      },
      { userId: auth.ctx.user.id, officeId: auth.ctx.officeId, role: auth.ctx.role },
    );
  } catch (error) {
    console.error("updateClientAction:", error);
    return { ok: false as const, error: "No se pudo guardar el cliente. Intenta de nuevo." };
  }
}

/** Delete a client and its pólizas in the office, with `client.delete` audit. */
export async function deleteClientAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsed = deleteClientSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Cliente no válido." };

  try {
    const result = await deleteClientCascadeAdmin({
      clientId: parsed.data.clientId,
      officeId: auth.ctx.officeId,
      consultantId: auth.ctx.role === "consultant" ? auth.ctx.consultantId : undefined,
      actorUserId: auth.ctx.user.id,
      actorRole: auth.ctx.role,
    });
    return result.ok ? { ok: true as const, data: result.data } : { ok: false as const, error: result.error };
  } catch (error) {
    console.error("deleteClientAction:", error);
    return { ok: false as const, error: "No se pudo eliminar el cliente." };
  }
}
