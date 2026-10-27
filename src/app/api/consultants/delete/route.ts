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
  /** Hard-delete the asesor. Default: soft INACTIVE. */
  forceDelete: z.boolean().optional().default(false),
  /** With forceDelete: also delete its pólizas (otherwise an asesor with pólizas is rejected). */
  withContracts: z.boolean().optional().default(false),
});

/**
 * Promotory-only: deactivate an asesor (INACTIVE) by default.
 * `forceDelete` hard-deletes it; with pólizas, `withContracts` must confirm deleting them too.
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
      withContracts: parsed.data.withContracts,
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
