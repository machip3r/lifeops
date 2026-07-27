import { authFetch } from "@/lib/api-client";
import type { File as LifeOpsFile } from "@/lib/supabase";

export type PendingDocument = {
  localId: string;
  file: globalThis.File | null;
  displayName: string;
};

export type UploadDocumentsResult = {
  uploaded: LifeOpsFile[];
  failures: Array<{ displayName: string; error: string }>;
};

/** Upload pending solicitud documents after the contract / change request exists. */
export async function uploadSolicitudDocuments(opts: {
  contractId: string;
  changeRequestId?: string | null;
  documents: PendingDocument[];
}): Promise<UploadDocumentsResult> {
  const uploaded: LifeOpsFile[] = [];
  const failures: Array<{ displayName: string; error: string }> = [];

  for (const doc of opts.documents) {
    if (!doc.file) {
      failures.push({
        displayName: doc.displayName || "Documento",
        error: "Selecciona un archivo.",
      });
      continue;
    }

    const form = new FormData();
    form.append("file", doc.file);
    form.append("contractId", opts.contractId);
    form.append("displayName", doc.displayName.trim());
    if (opts.changeRequestId) {
      form.append("changeRequestId", opts.changeRequestId);
    }

    try {
      const res = await authFetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });

      const json = (await res.json().catch(() => ({}))) as {
        file?: LifeOpsFile;
        error?: string;
      };

      if (!res.ok || !json.file) {
        failures.push({
          displayName: doc.displayName,
          error: json.error || "Error al subir el documento.",
        });
        continue;
      }

      uploaded.push(json.file);
    } catch (error: unknown) {
      failures.push({
        displayName: doc.displayName,
        error: error instanceof Error ? error.message : "Error al subir el documento.",
      });
    }
  }

  return { uploaded, failures };
}

export async function getDocumentSignedUrl(fileId: string): Promise<string> {
  const res = await authFetch(`/api/documents/${fileId}/url`, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "No se pudo obtener el enlace del documento.");
  }
  return json.url;
}
