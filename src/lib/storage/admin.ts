/**
 * Privileged Storage adapter — server only.
 * Documents bucket upload / signed URL / remove. Routes must not call storage APIs directly.
 */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

const DOCUMENTS_BUCKET = "documents";
export const DOCUMENT_SIGNED_URL_SECONDS = 60 * 10;

export async function uploadDocumentObject(opts: {
  path: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  return supabaseAdmin.storage.from(DOCUMENTS_BUCKET).upload(opts.path, opts.body, {
    contentType: opts.contentType,
    upsert: opts.upsert ?? false,
  });
}

export async function removeDocumentObjects(paths: string[]) {
  if (paths.length === 0) {
    return { data: null, error: null };
  }
  return supabaseAdmin.storage.from(DOCUMENTS_BUCKET).remove(paths);
}

export async function createDocumentSignedUrl(
  filePath: string,
  expiresInSeconds: number = DOCUMENT_SIGNED_URL_SECONDS,
) {
  return supabaseAdmin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(filePath, expiresInSeconds);
}
