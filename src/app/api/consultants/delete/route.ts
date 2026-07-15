import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase/admin";

const bodySchema = z.object({
  consultantId: z.string().uuid(),
  officeId: z.string().uuid(),
});

/**
 * Promotory-only: delete an asesorer for the office.
 * Cascades to that consultant's contracts (and related details/payments).
 * Also removes the Auth user when linked.
 */
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

  const { consultantId, officeId } = parsed.data;

  try {
    const { data: consultant, error: fetchError } = await supabaseAdmin
      .from("consultant")
      .select("id, office_id, auth_user_id, name, consultant_code")
      .eq("id", consultantId)
      .eq("office_id", officeId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!consultant) {
      return NextResponse.json({ error: "Asesor no encontrado." }, { status: 404 });
    }

    const { count: contractCount, error: countError } = await supabaseAdmin
      .from("contract")
      .select("id", { count: "exact", head: true })
      .eq("consultant_id", consultantId);

    if (countError) throw countError;

    const { error: deleteError } = await supabaseAdmin
      .from("consultant")
      .delete()
      .eq("id", consultantId)
      .eq("office_id", officeId);

    if (deleteError) throw deleteError;

    const authUserId = consultant.auth_user_id || consultant.id;
    if (authUserId) {
      const { error: authDeleteError } =
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (authDeleteError) {
        // Consultant row already removed; log but still succeed for the UI.
        console.error(
          `consultants/delete: auth user ${authUserId}:`,
          authDeleteError,
        );
      }
    }

    return NextResponse.json({
      success: true,
      deletedContracts: contractCount ?? 0,
      name: consultant.name,
      consultantCode: consultant.consultant_code,
    });
  } catch (e) {
    console.error("consultants/delete:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo eliminar el asesor.",
      },
      { status: 500 },
    );
  }
}
