/** Shared result shape for privileged mutations. */

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "not_found" | "conflict" | "invalid" | "error"; error: string };
