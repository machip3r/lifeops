import { NextRequest, NextResponse } from "next/server";
import { cleanupOfficeDataAdmin } from "@/lib/db-admin";
import { officeCleanupSchema } from "@/lib/validation/actions";
import { VALIDATION_MESSAGES, zodFieldErrors } from "@/lib/validation/field-errors";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireOfficeContext(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const promotory = assertPromotory(auth.ctx);
    if (!promotory.ok) {
      return NextResponse.json({ error: promotory.error }, { status: promotory.status });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = officeCleanupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Identificador de oficina inválido.",
          fieldErrors: zodFieldErrors(parsed.error, VALIDATION_MESSAGES),
        },
        { status: 400 },
      );
    }

    const { officeId } = parsed.data;

    const access = assertOfficeAccess(auth.ctx, officeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const result = await cleanupOfficeDataAdmin(officeId);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("Error in office cleanup API:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Error interno del servidor",
      },
      { status: 500 },
    );
  }
}
