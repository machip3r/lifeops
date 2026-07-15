import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { updateAuthUserEmail } from "@/lib/db-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { emailSchema, personNameSchema } from "@/lib/validation/schemas";

const bodySchema = z.object({
  consultantId: z.string().uuid(),
  officeId: z.string().uuid(),
  updates: z.object({
    name: personNameSchema.optional(),
    email: emailSchema.nullable().optional(),
    consultant_code: z.string().trim().max(64).nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
  }),
});

export async function POST(request: NextRequest) {
  const auth = await requireOfficeContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const promotory = assertPromotory(auth.ctx);
  if (!promotory.ok) {
    return NextResponse.json({ error: promotory.error }, { status: promotory.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { consultantId, updates } = parsed.data;

  try {
    const { data: consultant, error: fetchError } = await supabaseAdmin
      .from("consultant")
      .select("id, office_id, auth_user_id")
      .eq("id", consultantId)
      .eq("office_id", parsed.data.officeId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!consultant) {
      return NextResponse.json({ error: "Asesor no encontrado." }, { status: 404 });
    }

    if (updates.email !== undefined && consultant.auth_user_id) {
      await updateAuthUserEmail(consultant.auth_user_id, updates.email);
    }

    const { error } = await supabaseAdmin
      .from("consultant")
      .update(updates)
      .eq("id", consultantId)
      .eq("office_id", parsed.data.officeId);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("consultants/update:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar el asesor." },
      { status: 500 },
    );
  }
}
