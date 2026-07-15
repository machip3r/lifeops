import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { findMissingConsultantCodes } from "@/lib/db-admin";
import { EXTRACTOR_CONTRACT_NUMBER_BATCH } from "@/lib/extractor/batch";
import { consultantCodeSchema } from "@/lib/validation/schemas";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  /** Accept raw strings; validate per-code so one bad value does not blank the import. */
  codes: z.array(z.string()).max(EXTRACTOR_CONTRACT_NUMBER_BATCH),
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
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue
          ? `Datos inválidos (${issue.path.join(".") || "body"}): ${issue.message}`
          : "Datos inválidos.",
      },
      { status: 400 },
    );
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const validCodes: string[] = [];
  const invalidCodes: string[] = [];
  for (const raw of parsed.data.codes) {
    const checked = consultantCodeSchema.safeParse(raw.trim().replace(/\s+/g, ""));
    if (checked.success) {
      validCodes.push(checked.data);
    } else if (raw.trim()) {
      invalidCodes.push(raw.trim().slice(0, 64));
    }
  }

  if (parsed.data.codes.length > 0 && validCodes.length === 0) {
    return NextResponse.json(
      {
        error: `Códigos de asesor inválidos: ${invalidCodes.slice(0, 5).join(", ") || "(vacíos)"}`,
      },
      { status: 400 },
    );
  }

  try {
    const missing = await findMissingConsultantCodes(
      parsed.data.officeId,
      validCodes,
    );
    return NextResponse.json({
      missing,
      ...(invalidCodes.length > 0 ? { invalidCodes } : {}),
    });
  } catch (e) {
    console.error("missing-consultants:", e);
    return NextResponse.json(
      { error: "No se pudieron verificar los asesores." },
      { status: 500 },
    );
  }
}
