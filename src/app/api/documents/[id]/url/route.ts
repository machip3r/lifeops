import { NextRequest, NextResponse } from "next/server";
import { requireUserContext } from "@/lib/auth/api";
import { getFileRowForSignedUrlAdmin } from "@/lib/db-admin";
import {
  DOCUMENT_SIGNED_URL_SECONDS,
  createDocumentSignedUrl,
} from "@/lib/storage/admin";
import { uuidSchema } from "@/lib/validation/schemas";

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

    const fileRow = await getFileRowForSignedUrlAdmin(parsedId.data);
    if (!fileRow) {
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

    const { data: signed, error: signedError } = await createDocumentSignedUrl(
      fileRow.file_path,
    );

    if (signedError || !signed?.signedUrl) {
      console.error("Error creating signed URL:", signedError);
      return NextResponse.json({ error: "No se pudo generar el enlace." }, { status: 500 });
    }

    return NextResponse.json({
      url: signed.signedUrl,
      displayName: fileRow.display_name,
      fileName: fileRow.file_name,
      expiresIn: DOCUMENT_SIGNED_URL_SECONDS,
    });
  } catch (error: unknown) {
    console.error("Error in documents signed URL API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
