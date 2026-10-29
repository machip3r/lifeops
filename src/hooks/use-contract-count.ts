"use client";

import { useCallback, useState } from "react";
import { db } from "@/lib/db";
import { useQueryEffect } from "@/hooks/use-query-effect";

/**
 * Pólizas (any status) of an office or asesor; null while loading or on error (then the page
 * shows its normal content). `reload` after registering or importing.
 */
export function useContractCount(scope: { officeId?: string; consultantId?: string }, enabled = true) {
  const { officeId, consultantId } = scope;
  const [count, setCount] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setCount(await db.contract.countContracts({ officeId, consultantId }));
    } catch (error) {
      console.error("count contracts:", error);
      setCount(null);
    }
  }, [officeId, consultantId]);

  useQueryEffect(enabled && Boolean(officeId || consultantId), load);
  return { count, reload: load };
}
