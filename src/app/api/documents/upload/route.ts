import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireUserContext } from "@/lib/auth/api";
import {
  changeRequestBelongsToContractAdmin,
  collectionPaymentBelongsToContractAdmin,
  getContractForDocumentUploadAdmin,
  insertFileRecordAdmin,
} from "@/lib/db-admin";
import {
  removeDocumentObjects,
  uploadDocumentObject,
} from "@/lib/storage/admin";
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  LIMITS,
  documentDisplayNameSchema,
  documentMimeTypeSchema,
  uuidSchema,
} from "@/lib/validation/schemas";
import { VALIDATION_MESSAGES, zodFieldErrors } from "@/lib/validation/field-errors";
import { z } from "zod";

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
  collectionPaymentId: z.preprocess((v) => {
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
      collectionPaymentId: form.get("collectionPaymentId"),
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

    const { contractId, changeRequestId, collectionPaymentId, displayName } =
      parsedMeta.data;

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

    const contract = await getContractForDocumentUploadAdmin(contractId);
    if (!contract) {
      return NextResponse.json({ error: "Contrato no encontrado." }, { status: 404 });
    }

    const officeId = contract.office_id;
    const consultantId = contract.consultant_id;

    if (!officeId || officeId !== auth.ctx.officeId) {
      return NextResponse.json({ error: "No autorizado para este contrato." }, { status: 403 });
    }

    if (auth.ctx.role === "consultant" && auth.ctx.consultantId !== consultantId) {
      return NextResponse.json({ error: "No autorizado para este contrato." }, { status: 403 });
    }

    if (changeRequestId) {
      const ok = await changeRequestBelongsToContractAdmin(changeRequestId, contractId);
      if (!ok) {
        return NextResponse.json(
          { error: "Solicitud de cambio no encontrada para este contrato." },
          { status: 404 },
        );
      }
    }

    if (collectionPaymentId) {
      const ok = await collectionPaymentBelongsToContractAdmin(
        collectionPaymentId,
        contractId,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Pago de cobranza no encontrado para este contrato." },
          { status: 404 },
        );
      }
    }

    const contractCode = sanitizePathSegment(contract.contract_number || "sin-numero");
    const objectName = `${randomUUID()}-${sanitizeFileName(file.name)}`;
    const filePath = `${officeId}/${consultantId}/${contractId}/${contractCode}/${objectName}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await uploadDocumentObject({
      path: filePath,
      body: buffer,
      contentType: mimeParsed.data,
      upsert: false,
    });

    if (uploadError) {
      console.error("Error uploading document:", uploadError);
      return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
    }

    const { data: fileRow, error: insertError } = await insertFileRecordAdmin({
      officeId,
      consultantId,
      contractId,
      changeRequestId,
      collectionPaymentId,
      displayName,
      fileName: sanitizeFileName(file.name),
      filePath,
      fileType: mimeParsed.data,
      fileSize: file.size,
    });

    if (insertError || !fileRow) {
      console.error("Error inserting file row:", insertError);
      await removeDocumentObjects([filePath]);
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
