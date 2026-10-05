import { authFetch } from "@/lib/api-client";
import type { File as LifeOpsFile } from "@/lib/supabase";

export async function getDocumentSignedUrl(fileId: string): Promise<string> {
  const res = await authFetch(`/api/documents/${fileId}/url`, { method: "GET" });
  const json = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !json.url) {
    throw new Error(json.error || "No se pudo obtener el enlace del documento.");
  }
  return json.url;
}

/** Upload payment evidence linked to a cobranza month mark. */
export async function uploadPaymentEvidence(opts: {
  contractId: string;
  collectionPaymentId: string;
  file: globalThis.File;
  displayName?: string;
}): Promise<{ ok: true; file: LifeOpsFile } | { ok: false; error: string }> {
  const form = new FormData();
  form.append("file", opts.file);
  form.append("contractId", opts.contractId);
  form.append("collectionPaymentId", opts.collectionPaymentId);
  form.append(
    "displayName",
    (opts.displayName?.trim() || "Evidencia de pago").slice(0, 120),
  );

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
      return {
        ok: false,
        error: json.error || "Error al subir la evidencia.",
      };
    }
    return { ok: true, file: json.file };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Error al subir la evidencia.",
    };
  }
}
