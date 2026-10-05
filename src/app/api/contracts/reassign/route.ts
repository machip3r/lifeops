import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { reassignContractAdmin } from "@/lib/db-admin";
import { zodFieldErrors } from "@/lib/validation/field-errors";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  contractId: z.string().uuid(),
  toConsultantId: z.string().uuid(),
  notes: z.string().trim().max(500).optional().nullable(),
});

/**
 * Promotory-only: move a contract to another consultant in the same office.
 * Keeps client, policy number, details, cobranza, and files.
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
    return NextResponse.json(
      {
        error: "Datos inválidos.",
        fieldErrors: zodFieldErrors(parsed.error),
      },
      { status: 400 },
    );
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await reassignContractAdmin({
      officeId: parsed.data.officeId,
      contractId: parsed.data.contractId,
      toConsultantId: parsed.data.toConsultantId,
      actorUserId: auth.ctx.user.id,
      notes: parsed.data.notes,
    });

    if (!result.ok) {
      if (result.code === "not_found") {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      if (result.error.includes("ya pertenece")) {
        return NextResponse.json(
          {
            error: result.error,
            fieldErrors: { toConsultantId: "Selecciona un asesor distinto." },
          },
          { status: 400 },
        );
      }
      if (result.error.includes("inactivo")) {
        return NextResponse.json(
          {
            error: result.error,
            fieldErrors: {
              toConsultantId: "Elige un asesor activo o pendiente.",
            },
          },
          { status: 400 },
        );
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      ...result.data,
    });
  } catch (e) {
    console.error("contracts/reassign:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "No se pudo reasignar la póliza.",
      },
      { status: 500 },
    );
  }
}
