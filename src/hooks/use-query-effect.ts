"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Page index that returns to 1 when `resetKey` changes.
 * The adjustment happens during render so a filter change does not need an effect.
 */
export function useResetPage(resetKey: string): [number, (page: number) => void] {
  const [state, setState] = useState({ key: resetKey, page: 1 });
  if (state.key !== resetKey) {
    setState({ key: resetKey, page: 1 });
  }
  const page = state.key === resetKey ? state.page : 1;
  const setPage = useCallback((next: number) => {
    setState({ key: resetKey, page: next });
  }, [resetKey]);
  return [page, setPage];
}

/**
 * Loading flag that turns on during render when `queryKey` changes.
 * The fetch should set it back to false after `await`, not at the start of an effect.
 */
export function useQueryLoading(
  queryKey: string,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [loading, setLoading] = useState(true);
  const [seenKey, setSeenKey] = useState(queryKey);
  if (seenKey !== queryKey) {
    setSeenKey(queryKey);
    setLoading(true);
  }
  return [loading, setLoading];
}

/**
 * Start `query` from an effect. `query` must update React state only after `await`
 * (or from a timer/subscription callback), never before the first await.
 */
export function useQueryEffect(enabled: boolean, query: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      await query();
    })();
  }, [enabled, query]);
}
