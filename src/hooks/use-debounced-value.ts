"use client";

import { useEffect, useState } from "react";

/** Default delay for table search / filter text inputs. */
export const TABLE_FILTER_DEBOUNCE_MS = 300;

/**
 * Returns `value` delayed by `delayMs` (updates after typing pauses).
 * Useful so table fetches/filters don't run on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = TABLE_FILTER_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
