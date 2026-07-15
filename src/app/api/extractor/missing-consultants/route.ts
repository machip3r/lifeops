import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { findMissingConsultantCodes } from "@/lib/db-admin";
import { consultantCodeSchema } from "@/lib/validation/schemas";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  codes: z.array(consultantCodeSchema).max(500),
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

  try {
    const missing = await findMissingConsultantCodes(
      parsed.data.officeId,
      parsed.data.codes,
    );
    return NextResponse.json({ missing });
  } catch (e) {
    console.error("missing-consultants:", e);
    return NextResponse.json(
      { error: "No se pudieron verificar los asesores." },
      { status: 500 },
    );
  }
}
