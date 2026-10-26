"use client";

import { useCallback, useState } from "react";
import { useQueryEffect } from "@/hooks/use-query-effect";
import { db, type OfficeOnboarding, type OnboardingCatalogs } from "@/lib/db";

type State = {
  data: OfficeOnboarding | null;
  catalogs: OnboardingCatalogs | null;
  error: string | null;
};

/** Loads a promotoría's onboarding answers plus the catalogs (aseguradoras, ramos, estados). */
export function useOfficeOnboarding(officeId: string | null) {
  const [state, setState] = useState<State | null>(null);

  const load = useCallback(async () => {
    if (!officeId) return;
    try {
      const [data, catalogs] = await Promise.all([
        db.officeOnboarding.get(officeId),
        db.officeOnboarding.listCatalogs(),
      ]);
      setState({ data, catalogs, error: null });
    } catch (error) {
      console.error("load office onboarding:", error);
      setState({ data: null, catalogs: null, error: "No se pudo cargar la información. Intenta de nuevo." });
    }
  }, [officeId]);

  useQueryEffect(Boolean(officeId), load);

  return {
    loading: state === null,
    data: state?.data ?? null,
    catalogs: state?.catalogs ?? null,
    error: state?.error ?? null,
    reload: load,
  };
}
