import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { acceptConsultantInviteAdmin } from "@/lib/db-admin";
import { passwordSchema } from "@/lib/validation/schemas";
import { VALIDATION_MESSAGES, zodFieldErrors } from "@/lib/validation/field-errors";

const bodySchema = z.object({
  token: z.string().trim().min(16).max(128),
  password: passwordSchema,
});

/**
 * Public invite acceptance — creates Auth user + links consultant via service role
 * (avoids anon EXECUTE on create_consultant after signup without session).
 */
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Datos inválidos.",
        fieldErrors: zodFieldErrors(parsed.error, VALIDATION_MESSAGES),
      },
      { status: 400 },
    );
  }

  try {
    const result = await acceptConsultantInviteAdmin(parsed.data);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({
      success: true,
      email: result.email,
      message: "Cuenta creada. Ya puedes iniciar sesión.",
    });
  } catch (e) {
    console.error("invite/accept:", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "No se pudo completar el registro.",
      },
      { status: 500 },
    );
  }
}
