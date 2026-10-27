/** Result of an audited edit: safe Spanish copy for the UI, per-field messages when one field is at fault. */
export type EditResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };
