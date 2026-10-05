import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { deactivateOrDeleteConsultantAdmin } from "@/lib/db-admin";

const bodySchema = z.object({
  consultantId: z.string().uuid(),
  officeId: z.string().uuid(),
  /** Hard-delete only when the consultant has zero contracts. Default: soft INACTIVE. */
  forceDelete: z.boolean().optional().default(false),
});

/**
 * Promotory-only: deactivate an asesor (INACTIVE) by default.
 * Hard-delete is allowed only when `forceDelete` and the asesor has no contracts.
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

  try {
    const result = await deactivateOrDeleteConsultantAdmin({
      consultantId: parsed.data.consultantId,
      officeId: parsed.data.officeId,
      forceDelete: parsed.data.forceDelete,
      actorUserId: auth.ctx.user.id,
    });

    if (!result.ok) {
      const status =
        result.code === "not_found"
          ? 404
          : result.code === "conflict"
            ? 409
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true, ...result.data });
  } catch (e) {
    console.error("consultants/delete:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo desactivar el asesor.",
      },
      { status: 500 },
    );
  }
}
