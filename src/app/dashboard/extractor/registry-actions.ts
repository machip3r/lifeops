"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb } from "@/lib/db";
import { ensureConsultantForImport } from "@/lib/db-admin";
import {
  applyRegistry,
  previewRegistry,
  type RegistryApplyResult,
  type RegistryPreview,
} from "@/lib/extractor/registry/import-registry";
import type { RegistryField } from "@/lib/extractor/registry/fields";
import { createUserClient } from "@/lib/supabase/user-client";
import { registryImportBatchSchema } from "@/lib/validation/schemas";

type ActionFailure = { ok: false; error: string };

const INVALID_FILE_DATA = "El archivo tiene datos que no se pueden importar. Revisa las filas marcadas.";

/** Registry imports load the whole office cartera: promotoría only. */
async function registrySession(accessToken: string) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (auth.ctx.role !== "promotory") {
    return { ok: false as const, error: "Solo la promotoría puede importar la cartera completa." };
  }
  return { ok: true as const, ctx: auth.ctx, db: createDb(createUserClient(accessToken)) };
}

/** Review step: what is new, what only fills empty data and what differs from LifeOps (batch). */
export async function previewRegistryImportAction(
  accessToken: string,
  input: unknown,
): Promise<({ ok: true } & RegistryPreview) | ActionFailure> {
  const session = await registrySession(accessToken);
  if (!session.ok) return session;
  const parsed = registryImportBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_FILE_DATA };
  try {
    const preview = await previewRegistry(session.db, { officeId: session.ctx.officeId, rows: parsed.data.rows });
    return { ok: true, ...preview };
  } catch (error) {
    console.error("previewRegistryImportAction:", error);
    return { ok: false, error: "No se pudo comparar el archivo con LifeOps. Intenta de nuevo." };
  }
}

/** Import one batch: creates missing asesores (sin invitar), then pólizas and the picked updates. */
export async function applyRegistryImportAction(
  accessToken: string,
  input: unknown,
): Promise<({ ok: true } & RegistryApplyResult) | ActionFailure> {
  const session = await registrySession(accessToken);
  if (!session.ok) return session;
  const parsed = registryImportBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_FILE_DATA };
  const { officeId, user } = session.ctx;

  try {
    const known = new Set(
      (await session.db.consultant.getConsultantsByOffice(officeId))
        .map((c) => (c.consultant_code ?? "").trim().toLowerCase())
        .filter(Boolean),
    );
    const warnings: RegistryApplyResult["warnings"] = [];
    const missing = new Map<string, { code: string; name: string | null; row: number }>();
    for (const row of parsed.data.rows) {
      const key = row.consultantCode.trim().toLowerCase();
      if (!known.has(key) && !missing.has(key)) missing.set(key, { code: row.consultantCode, name: row.consultantName, row: row.index });
    }
    for (const { code, name, row } of missing.values()) {
      const created = await ensureConsultantForImport(code, officeId, name);
      if (!created.consultant) warnings.push({ row, message: `No se pudo crear al asesor ${code}: ${created.error ?? "error"}` });
    }

    const result = await applyRegistry(session.db, {
      officeId,
      actor: { userId: user.id, officeId, role: "promotory" },
      source: parsed.data.source,
      rows: parsed.data.rows,
      updates: (parsed.data.updates ?? {}) as Record<string, RegistryField[]>,
    });
    return { ok: true, ...result, warnings: [...warnings, ...result.warnings] };
  } catch (error) {
    console.error("applyRegistryImportAction:", error);
    return { ok: false, error: "No se pudo importar este bloque de pólizas. Intenta de nuevo." };
  }
}
