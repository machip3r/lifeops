import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { updateConsultantAdmin } from "@/lib/db-admin";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import {
  consultantCodeSchema,
  emailSchema,
  entityNameSchema,
} from "@/lib/validation/schemas";

const bodySchema = z.object({
  consultantId: z.string().uuid(),
  officeId: z.string().uuid(),
  updates: z.object({
    // entityName (not personName): import may seed name = consultant code (digits).
    name: entityNameSchema.optional(),
    email: emailSchema.nullable().optional(),
    consultant_code: consultantCodeSchema.nullable().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "PENDING", "NOT_INVITED"]).optional(),
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
    return NextResponse.json(
      {
        error: "Datos inválidos.",
        fieldErrors: zodFieldErrors(parsed.error, undefined, {
          name: "entityName",
          email: "email",
          consultant_code: "consultantCode",
        }),
      },
      { status: 400 },
    );
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const result = await updateConsultantAdmin({
      consultantId: parsed.data.consultantId,
      officeId: parsed.data.officeId,
      updates: parsed.data.updates,
    });

    if (!result.ok) {
      const status = result.code === "not_found" ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("consultants/update:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudo actualizar el asesor." },
      { status: 500 },
    );
  }
}
