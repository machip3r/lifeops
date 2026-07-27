import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUserContext } from "@/lib/auth/api";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  LIMITS,
  documentDisplayNameSchema,
  documentMimeTypeSchema,
  uuidSchema,
} from "@/lib/validation/schemas";
import { VALIDATION_MESSAGES, zodFieldErrors } from "@/lib/validation/field-errors";
import { z } from "zod";

const DOCUMENTS_BUCKET = "documents";

function sanitizePathSegment(value: string): string {
  const cleaned = value
    .trim()
    .replace(/[^A-Za-z0-9._\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 64);
  return cleaned.length > 0 ? cleaned : "sin-numero";
}

function sanitizeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "archivo";
  const cleaned = base
    .replace(/[^A-Za-z0-9._\-]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120);
  return cleaned.length > 0 ? cleaned : "archivo";
}

const formMetaSchema = z.object({
  contractId: uuidSchema,
  changeRequestId: z.preprocess((v) => {
    if (v === undefined || v === null || v === "") return null;
    return v;
  }, uuidSchema.nullable()),
  displayName: documentDisplayNameSchema,
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireUserContext(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Archivo requerido.", fieldErrors: { file: VALIDATION_MESSAGES.required } },
        { status: 400 },
      );
    }

    const parsedMeta = formMetaSchema.safeParse({
      contractId: form.get("contractId"),
      changeRequestId: form.get("changeRequestId"),
      displayName: form.get("displayName"),
    });

    if (!parsedMeta.success) {
      return NextResponse.json(
        {
          error: "Datos del documento inválidos.",
          fieldErrors: zodFieldErrors(parsedMeta.error, VALIDATION_MESSAGES),
        },
        { status: 400 },
      );
    }

    const { contractId, changeRequestId, displayName } = parsedMeta.data;

    if (file.size <= 0 || file.size > LIMITS.documentFileBytes) {
      return NextResponse.json(
        {
          error: "El archivo supera el tamaño máximo permitido (20 MB).",
          fieldErrors: { file: "El archivo supera el tamaño máximo permitido (20 MB)." },
        },
        { status: 400 },
      );
    }

    const mimeParsed = documentMimeTypeSchema.safeParse(file.type || "");
    if (!mimeParsed.success) {
      return NextResponse.json(
        {
          error: "Tipo de archivo no permitido.",
          fieldErrors: {
            file: `Tipos permitidos: ${DOCUMENT_ALLOWED_MIME_TYPES.join(", ")}`,
          },
        },
        { status: 400 },
      );
    }

    const { data: contract, error: contractError } = await supabaseAdmin
      .from("contract")
      .select("id, contract_number, consultant_id, consultant:consultant_id(id, office_id)")
      .eq("id", contractId)
      .maybeSingle();

    if (contractError || !contract) {
      return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
    }

    const consultant = Array.isArray(contract.consultant)
      ? contract.consultant[0]
      : contract.consultant;

    const officeId = (consultant as { office_id?: string } | null)?.office_id;
    const consultantId = contract.consultant_id as string;

    if (!officeId || officeId !== auth.ctx.officeId) {
      return NextResponse.json({ error: "No autorizado para este contrato." }, { status: 403 });
    }

    if (auth.ctx.role === "consultant" && auth.ctx.consultantId !== consultantId) {
      return NextResponse.json({ error: "No autorizado para este contrato." }, { status: 403 });
    }

    if (changeRequestId) {
      const { data: changeRequest, error: crError } = await supabaseAdmin
        .from("contract_change_request")
        .select("id, contract_id")
        .eq("id", changeRequestId)
        .maybeSingle();

      if (crError || !changeRequest || changeRequest.contract_id !== contractId) {
        return NextResponse.json(
          { error: "Solicitud de cambio no encontrada para este contrato." },
          { status: 404 },
        );
      }
    }

    const contractCode = sanitizePathSegment(contract.contract_number || "sin-numero");
    const objectName = `${randomUUID()}-${sanitizeFileName(file.name)}`;
    const filePath = `${officeId}/${consultantId}/${contractId}/${contractCode}/${objectName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(filePath, buffer, {
        contentType: mimeParsed.data,
        upsert: false,
      });

    if (uploadError) {
      console.error("Error uploading document:", uploadError);
      return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
    }

    const { data: fileRow, error: insertError } = await supabaseAdmin
      .from("file")
      .insert({
        office_id: officeId,
        consultant_id: consultantId,
        contract_id: contractId,
        change_request_id: changeRequestId,
        display_name: displayName,
        file_name: sanitizeFileName(file.name),
        file_path: filePath,
        file_type: mimeParsed.data,
        file_size: file.size,
        file_url: null,
        status: "ACTIVE",
        metadata: {},
      })
      .select()
      .single();

    if (insertError || !fileRow) {
      console.error("Error inserting file row:", insertError);
      await supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove([filePath]);
      return NextResponse.json({ error: "No se pudo registrar el documento." }, { status: 500 });
    }

    return NextResponse.json({ file: fileRow }, { status: 201 });
  } catch (error: unknown) {
    console.error("Error in documents upload API:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
