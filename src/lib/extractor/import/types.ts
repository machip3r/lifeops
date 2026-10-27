export type CommissionImportMeta = {
  /** Emission date of the commission file (YYYY-MM-DD). */
  fileIssueDate: string;
  fileName?: string | null;
};

export type CommissionImportResult = {
  success: number;
  errors: Array<{ row: number; error: string }>;
  warnings: Array<{ row: number; message: string }>;
};

export type CommissionImportCounts = {
  contractsCreated: number;
  contractsUpdated: number;
  detailsInserted: number;
  detailsUpdated: number;
  paymentsMarked: number;
};

/** What one server batch returns; the browser adds them up. */
export type CommissionImportBatchResult = CommissionImportResult & {
  counts: CommissionImportCounts;
};

/** Re-import review: one change the file would make to a póliza already in LifeOps. */
type CommissionChange = { field: string; label: string; current: string; incoming: string };

export type CommissionChangeItem = {
  contractNumber: string;
  clientName: string;
  /** Empty in LifeOps: filled automatically */
  fills: CommissionChange[];
  /** Different from LifeOps: applied only when picked */
  diffs: CommissionChange[];
};
