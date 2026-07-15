import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { createConsultantWithAuth, ensureConsultantForImport } from "@/lib/db-admin";
import {
  consultantCodeSchema,
  emailSchema,
  passwordSchema,
} from "@/lib/validation/schemas";

const autoBodySchema = z.object({
  mode: z.literal("auto").default("auto"),
  officeId: z.string().uuid(),
  codes: z.array(consultantCodeSchema).min(1).max(200),
});

const manualBodySchema = z.object({
  mode: z.literal("manual"),
  officeId: z.string().uuid(),
  consultants: z
    .array(
      z.object({
        consultantCode: consultantCodeSchema,
        name: z.string().trim().min(1).max(120),
        email: emailSchema,
        password: passwordSchema,
      }),
    )
    .min(1)
    .max(200),
});

const bodySchema = z.union([manualBodySchema, autoBodySchema]);

export async function POST(request: NextRequest) {
  const auth = await requireOfficeContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const promotory = assertPromotory(auth.ctx);
  if (!promotory.ok) {
    return NextResponse.json({ error: promotory.error }, { status: promotory.status });
  }

  const raw = await request.json().catch(() => ({}));
  const withMode = { mode: "auto", ...raw };
  const parsed = bodySchema.safeParse(withMode);
  if (!parsed.success) {
    return NextResponse.json({ error: "Datos de asesores inválidos." }, { status: 400 });
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const officeId = parsed.data.officeId;

  try {
    if (parsed.data.mode === "manual") {
      const created: string[] = [];
      for (const c of parsed.data.consultants) {
        await createConsultantWithAuth(officeId, c);
        created.push(c.consultantCode);
      }
      return NextResponse.json({ success: true, created });
    }

    const results: Array<{ code: string; created: boolean; error?: string }> = [];
    for (const code of parsed.data.codes) {
      const ensured = await ensureConsultantForImport(code, officeId);
      results.push({
        code,
        created: ensured.created,
        error: ensured.error,
      });
    }
    return NextResponse.json({ success: true, results });
  } catch (e) {
    console.error("create-consultants:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "No se pudieron crear los asesores." },
      { status: 500 },
    );
  }
}
