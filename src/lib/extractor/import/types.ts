export type CommissionImportMeta = {
  /** Emission date of the commission file (YYYY-MM-DD). */
  fileIssueDate: string;
  /** Contract number (normalized) → ISO last known payment, for first-time pólizas. */
  priorPaymentByContract?: Record<string, string>;
  fileName?: string | null;
  requirePriorForNew?: boolean;
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
