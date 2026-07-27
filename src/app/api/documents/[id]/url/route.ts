import { NextRequest, NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { uuidSchema } from "@/lib/validation/schemas";

const DOCUMENTS_BUCKET = "documents";
const SIGNED_URL_SECONDS = 60 * 10;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireUserContext(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await context.params;
    const parsedId = uuidSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }

    const { data: fileRow, error: fileError } = await supabaseAdmin
      .from("file")
      .select("id, office_id, consultant_id, file_path, display_name, file_name")
      .eq("id", parsedId.data)
      .maybeSingle();

    if (fileError || !fileRow) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }

    if (fileRow.office_id !== auth.ctx.officeId) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    if (
      auth.ctx.role === "consultant" &&
      auth.ctx.consultantId !== fileRow.consultant_id
    ) {
      return NextResponse.json({ error: "No autorizado." }, { status: 403 });
    }

    const { data: signed, error: signedError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(fileRow.file_path, SIGNED_URL_SECONDS);

    if (signedError || !signed?.signedUrl) {
      console.error("Error creating signed URL:", signedError);
      return NextResponse.json({ error: "No se pudo generar el enlace." }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      displayName: fileRow.display_name,
      fileName: fileRow.file_name,
      expiresIn: SIGNED_URL_SECONDS,
    });
  } catch (error: unknown) {
    console.error("Error in documents signed URL API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
