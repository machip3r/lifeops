import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { createConsultantWithAuth, ensureConsultantForImport } from "@/lib/db-admin";
import { IMPORT_BATCH_SIZE } from "@/lib/extractor/batch";
import {
  consultantCodeSchema,
  emailSchema,
  LIMITS,
  passwordSchema,
} from "@/lib/validation/schemas";

const importConsultantSchema = z.object({
  code: z.string().trim().min(1).max(LIMITS.consultantCode),
  name: z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed.slice(0, LIMITS.entityName);
  }, z.string().max(LIMITS.entityName).optional()),
});

const autoBodySchema = z
  .object({
    mode: z.literal("auto").default("auto"),
    officeId: z.string().uuid(),
    /** @deprecated Prefer `consultants` with optional names. */
    codes: z.array(z.string()).max(IMPORT_BATCH_SIZE).optional(),
    consultants: z.array(importConsultantSchema).max(IMPORT_BATCH_SIZE).optional(),
  })
  .refine(
    (d) =>
      (d.consultants != null && d.consultants.length > 0) ||
      (d.codes != null && d.codes.length > 0),
    { message: "codes or consultants required" },
  );

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
    .max(IMPORT_BATCH_SIZE),
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
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue
          ? `Datos de asesores inválidos (${issue.path.join(".") || "body"}): ${issue.message}`
          : "Datos de asesores inválidos.",
      },
      { status: 400 },
    );
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

    const rawEntries =
      parsed.data.consultants && parsed.data.consultants.length > 0
        ? parsed.data.consultants.map((c) => ({
            code: c.code,
            name: c.name?.trim() || undefined,
          }))
        : (parsed.data.codes ?? []).map((code) => ({
            code,
            name: undefined as string | undefined,
          }));

    // De-dupe by code (keep first non-empty name); drop invalid codes
    const byCode = new Map<string, { code: string; name?: string }>();
    const invalidCodes: string[] = [];
    for (const entry of rawEntries) {
      const checked = consultantCodeSchema.safeParse(
        entry.code.trim().replace(/\s+/g, ""),
      );
      if (!checked.success) {
        if (entry.code.trim()) invalidCodes.push(entry.code.trim().slice(0, 64));
        continue;
      }
      const key = checked.data.toLowerCase();
      const prev = byCode.get(key);
      if (!prev) {
        byCode.set(key, { code: checked.data, name: entry.name });
        continue;
      }
      if (!prev.name && entry.name) {
        byCode.set(key, { code: checked.data, name: entry.name });
      }
    }

    if (byCode.size === 0) {
      return NextResponse.json(
        {
          error:
            invalidCodes.length > 0
              ? `Códigos de asesor inválidos: ${invalidCodes.slice(0, 5).join(", ")}`
              : "No hay códigos de asesor para crear.",
        },
        { status: 400 },
      );
    }

    const results: Array<{ code: string; created: boolean; error?: string }> =
      [];
    for (const entry of byCode.values()) {
      const ensured = await ensureConsultantForImport(
        entry.code,
        officeId,
        entry.name,
      );
      results.push({
        code: entry.code,
        created: ensured.created,
        error: ensured.error,
      });
    }
    for (const code of invalidCodes) {
      results.push({
        code,
        created: false,
        error: "Código de asesor con formato inválido",
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
