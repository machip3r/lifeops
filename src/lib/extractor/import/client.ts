import {
  finishCommissionImportAction,
  importCommissionBatchAction,
  previewCommissionChangesAction,
  startCommissionImportAction,
} from "@/app/dashboard/extractor/actions";
import { getSession } from "@/lib/auth/client";
import {
  importProgressPercent,
  type ImportProgress,
} from "@/lib/extractor/import-progress";
import { planImportBatches, type IndexedRow } from "./columns";
import type {
  CommissionChangeItem,
  CommissionImportBatchResult,
  CommissionImportCounts,
  CommissionImportMeta,
  CommissionImportResult,
} from "./types";

/** Attempts per batch; re-sending a batch is safe (receipts and pólizas are never duplicated). */
const BATCH_ATTEMPTS = 3;

/** Fresh token per call so a long import survives token refreshes. */
async function accessToken(): Promise<string> {
  const { session } = await getSession();
  if (!session?.access_token) throw new Error("Tu sesión expiró. Inicia sesión de nuevo.");
  return session.access_token;
}

async function sendBatch(
  commissionImportId: string | null,
  headers: string[],
  rows: IndexedRow[],
  importMeta: CommissionImportMeta,
  decisions: Record<string, string[]>,
): Promise<CommissionImportBatchResult> {
  let lastError = "No se pudo importar este lote.";
  for (let attempt = 1; attempt <= BATCH_ATTEMPTS; attempt++) {
    try {
      const res = await importCommissionBatchAction(await accessToken(), {
        commissionImportId,
        headers,
        rows,
        importMeta,
        decisions,
      });
      if (res.ok) return res;
      lastError = res.error;
      break; // validation / auth: retrying won't help
    } catch (error) {
      console.error(`import batch attempt ${attempt} failed`, error);
      await new Promise((resolve) => setTimeout(resolve, attempt * 1500));
    }
  }
  return {
    success: 0,
    errors: [{
      row: (rows[0]?.index ?? 0) + 1,
      error: `${lastError} Filas ${(rows[0]?.index ?? 0) + 1}–${(rows[rows.length - 1]?.index ?? 0) + 1}: vuelve a importar el archivo; lo ya guardado no se duplica.`,
    }],
    warnings: [],
    counts: { contractsCreated: 0, contractsUpdated: 0, detailsInserted: 0, detailsUpdated: 0, paymentsMarked: 0 },
  };
}

/**
 * Commission import coordinated by the browser: the table is split into batches of whole
 * pólizas and each batch runs on the server (Server Action) in a few seconds, so the total
 * import has no time limit no matter how many pólizas the promotoría has.
 */
export async function runCommissionImport(input: {
  rows: string[][];
  headers: string[];
  importMeta: CommissionImportMeta;
  /** Review picks per póliza number (step 2); not listed = keep LifeOps */
  decisions?: Record<string, string[]>;
  onProgress?: (progress: ImportProgress) => void;
}): Promise<CommissionImportResult> {
  const report = (
    phase: ImportProgress["phase"],
    current: number,
    total: number,
    message: string,
    etaSeconds: number | null = null,
  ) =>
    input.onProgress?.({
      phase,
      current,
      total,
      percent: importProgressPercent(phase, current, total),
      etaSeconds,
      message,
    });

  report("grouping", 0, 1, "Agrupando filas por póliza…");
  const { batches, contractCount } = planImportBatches(input.rows, input.headers);
  report("grouping", 1, 1, `${contractCount} póliza(s) desde ${input.rows.length} fila(s)`);

  const started = await startCommissionImportAction(await accessToken(), {
    rowCount: input.rows.length,
    importMeta: input.importMeta,
  });
  if (!started.ok) {
    return { success: 0, errors: [{ row: 0, error: started.error }], warnings: [] };
  }

  const result: CommissionImportResult = {
    success: 0,
    errors: [],
    warnings: started.warnings.map((message) => ({ row: 0, message })),
  };
  const counts: CommissionImportCounts = {
    contractsCreated: 0,
    contractsUpdated: 0,
    detailsInserted: 0,
    detailsUpdated: 0,
    paymentsMarked: 0,
  };

  const startedAt = Date.now();
  let rowsDone = 0;
  report("contracts", 0, input.rows.length, `Importando pólizas (0/${contractCount})…`);
  for (const batch of batches) {
    const batchResult = await sendBatch(
      started.commissionImportId,
      input.headers,
      batch,
      input.importMeta,
      input.decisions ?? {},
    );
    result.success += batchResult.success;
    result.errors.push(...batchResult.errors);
    result.warnings.push(...batchResult.warnings);
    for (const key of Object.keys(counts) as Array<keyof CommissionImportCounts>) {
      counts[key] += batchResult.counts[key];
    }

    rowsDone += batch.length;
    const msPerRow = (Date.now() - startedAt) / rowsDone;
    report(
      "contracts",
      rowsDone,
      input.rows.length,
      `Importando pólizas (${result.success}/${contractCount})…`,
      Math.round(((input.rows.length - rowsDone) * msPerRow) / 1000),
    );
  }

  report("finalize", 0, 1, "Guardando el resumen de la importación…");
  const finished = await finishCommissionImportAction(await accessToken(), {
    commissionImportId: started.commissionImportId,
    contractsProcessed: result.success,
    errorCount: result.errors.length,
    counts,
  }).catch((error: unknown) => {
    console.error("finish import failed", error);
    return null;
  });
  if (!finished?.ok) {
    result.warnings.push({
      row: 0,
      message: "La información se importó, pero no se pudo guardar el resumen del lote.",
    });
  }

  report(
    "done",
    1,
    1,
    `Listo: ${result.success} póliza(s), ${counts.detailsInserted} detalle(s) nuevo(s), ${counts.detailsUpdated} actualizado(s)`,
  );
  return result;
}

/** Step 2 review: compares the file with LifeOps batch by batch (same batches as the import). */
export async function previewCommissionChanges(input: {
  rows: string[][];
  headers: string[];
}): Promise<{ items: CommissionChangeItem[]; error: string | null }> {
  const { batches } = planImportBatches(input.rows, input.headers);
  const items: CommissionChangeItem[] = [];
  for (const batch of batches) {
    const res = await previewCommissionChangesAction(await accessToken(), { headers: input.headers, rows: batch });
    if (!res.ok) return { items, error: res.error };
    items.push(...res.items);
  }
  return { items, error: null };
}
