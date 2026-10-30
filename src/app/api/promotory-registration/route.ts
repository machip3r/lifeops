import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { consumePromotoryRegistrationTokenAdmin, getPromotoryRegistrationTokenAdmin } from "@/lib/db-admin";
import { createAuthUser, deleteAuthUser } from "@/lib/auth/admin";
import { emailSchema, passwordSchema } from "@/lib/validation/schemas";
import { VALIDATION_MESSAGES, zodFieldErrors } from "@/lib/validation/field-errors";

const registrationSchema = z.object({
  token: z.string().trim().regex(/^[a-f0-9]{64}$/i),
  email: emailSchema,
  password: passwordSchema,
});

export async function POST(request: NextRequest) {
  const parsed = registrationSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Revisa los datos e intenta de nuevo.", fieldErrors: zodFieldErrors(parsed.error, VALIDATION_MESSAGES) }, { status: 400 });
  }

  const { token, email, password } = parsed.data;
  let createdAuthUserId: string | null = null;
  try {
    const invitation = await getPromotoryRegistrationTokenAdmin(token);
    if (!invitation.valid) {
      return NextResponse.json({ error: "Este enlace no es válido, ya se usó o venció." }, { status: 410 });
    }

    const { data, error } = await createAuthUser({
      email,
      password,
      emailConfirm: true,
      userMetadata: { intended_role: "promotory", role: "promotory" },
    });
    if (error || !data.user) {
      const message = error?.message.toLowerCase() ?? "";
      const conflict = /already|registered|exists/.test(message);
      return NextResponse.json({ error: conflict ? "Ya existe una cuenta con ese correo. Inicia sesión o usa otro correo." : "No se pudo crear la cuenta. Intenta de nuevo." }, { status: conflict ? 409 : 400 });
    }
    createdAuthUserId = data.user.id;

    const consumed = await consumePromotoryRegistrationTokenAdmin(token);
    if (!consumed) {
      const rollback = await deleteAuthUser(data.user.id);
      if (rollback.error) console.error("promotory registration rollback:", rollback.error);
      createdAuthUserId = null;
      return NextResponse.json({ error: "Este enlace ya se usó o venció. Solicita uno nuevo." }, { status: 410 });
    }
    createdAuthUserId = null;

    return NextResponse.json({ success: true, email });
  } catch (error) {
    console.error("promotory registration:", error);
    if (createdAuthUserId) {
      const rollback = await deleteAuthUser(createdAuthUserId).catch((rollbackError) => {
        console.error("promotory registration rollback:", rollbackError);
        return null;
      });
      if (rollback?.error) console.error("promotory registration rollback:", rollback.error);
    }
    return NextResponse.json({ error: "No se pudo completar el registro. Intenta de nuevo." }, { status: 500 });
  }
}
