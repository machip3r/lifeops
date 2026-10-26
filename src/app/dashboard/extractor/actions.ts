"use server";

import { resolveOfficeContext, type OfficeContext } from "@/lib/auth/api";
import { createDb, type Db } from "@/lib/db";
import {
  finishCommissionImport,
  importCommissionBatch,
  startCommissionImport,
} from "@/lib/extractor/import/import-contracts";
import type { CommissionImportBatchResult } from "@/lib/extractor/import/types";
import { createUserClient } from "@/lib/supabase/user-client";
import {
  commissionImportBatchSchema,
  commissionImportFinishSchema,
  commissionImportStartSchema,
} from "@/lib/validation/schemas";

type ActionFailure = { ok: false; error: string };

const INVALID_FILE_DATA = "El archivo tiene datos que no se pueden importar.";

async function importSession(
  accessToken: string,
): Promise<{ ok: true; ctx: OfficeContext; db: Db } | ActionFailure> {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false, error: auth.error };
  // JWT-bound client: RLS scopes every import query to the caller
  return { ok: true, ctx: auth.ctx, db: createDb(createUserClient(accessToken)) };
}

/** The batch record must belong to the caller's office (null = asesor without batch record). */
async function ownsBatch(db: Db, ctx: OfficeContext, commissionImportId: string | null) {
  if (!commissionImportId) return true;
  return db.commissionImport.belongsToOffice(commissionImportId, ctx.officeId);
}

export async function startCommissionImportAction(
  accessToken: string,
  input: unknown,
): Promise<{ ok: true; commissionImportId: string | null; warnings: string[] } | ActionFailure> {
  const session = await importSession(accessToken);
  if (!session.ok) return session;
  const parsed = commissionImportStartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_FILE_DATA };

  const started = await startCommissionImport({
    db: session.db,
    actorUserId: session.ctx.user.id,
    officeId: session.ctx.officeId,
    rowCount: parsed.data.rowCount,
    importMeta: parsed.data.importMeta,
  });
  if (started.error) return { ok: false, error: started.error };
  return { ok: true, commissionImportId: started.commissionImportId, warnings: started.warnings };
}

export async function importCommissionBatchAction(
  accessToken: string,
  input: unknown,
): Promise<({ ok: true } & CommissionImportBatchResult) | ActionFailure> {
  const session = await importSession(accessToken);
  if (!session.ok) return session;
  const parsed = commissionImportBatchSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_FILE_DATA };
  if (!(await ownsBatch(session.db, session.ctx, parsed.data.commissionImportId))) {
    return { ok: false, error: "No autorizado para este lote de importación." };
  }

  const result = await importCommissionBatch({
    db: session.db,
    actorUserId: session.ctx.user.id,
    officeId: session.ctx.officeId,
    // Asesores are scoped by their session, never by the request
    consultantId: session.ctx.role === "consultant" ? session.ctx.consultantId : undefined,
    commissionImportId: parsed.data.commissionImportId,
    headers: parsed.data.headers,
    rows: parsed.data.rows,
    importMeta: parsed.data.importMeta,
  });
  return { ok: true, ...result };
}

export async function finishCommissionImportAction(
  accessToken: string,
  input: unknown,
): Promise<{ ok: true } | ActionFailure> {
  const session = await importSession(accessToken);
  if (!session.ok) return session;
  const parsed = commissionImportFinishSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID_FILE_DATA };
  if (!(await ownsBatch(session.db, session.ctx, parsed.data.commissionImportId))) {
    return { ok: false, error: "No autorizado para este lote de importación." };
  }

  await finishCommissionImport({
    db: session.db,
    actorUserId: session.ctx.user.id,
    officeId: session.ctx.officeId,
    ...parsed.data,
  });
  return { ok: true };
}
