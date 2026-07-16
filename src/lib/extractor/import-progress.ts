export type ImportProgress = {
  phase:
    | "grouping"
    | "consultants"
    | "clients"
    | "contracts"
    | "finalize"
    | "done";
  /** Units completed in this phase (e.g. contracts processed). */
  current: number;
  /** Total units in this phase. */
  total: number;
  /** 0–100 overall estimate across phases. */
  percent: number;
  /** Rough remaining seconds, or null until enough samples. */
  etaSeconds: number | null;
  message: string;
};

type PhaseWeight = { phase: ImportProgress["phase"]; weight: number };

const PHASE_WEIGHTS: PhaseWeight[] = [
  { phase: "grouping", weight: 5 },
  { phase: "consultants", weight: 10 },
  { phase: "clients", weight: 10 },
  { phase: "contracts", weight: 70 },
  { phase: "finalize", weight: 5 },
];

function phaseIndex(phase: ImportProgress["phase"]): number {
  return Math.max(
    0,
    PHASE_WEIGHTS.findIndex((p) => p.phase === phase),
  );
}

/** Weighted percent across import phases. */
export function importProgressPercent(
  phase: ImportProgress["phase"],
  current: number,
  total: number,
): number {
  if (phase === "done") return 100;
  const idx = phaseIndex(phase);
  const totalWeight = PHASE_WEIGHTS.reduce((s, p) => s + p.weight, 0);
  const completedWeight = PHASE_WEIGHTS.slice(0, idx).reduce(
    (s, p) => s + p.weight,
    0,
  );
  const phaseWeight = PHASE_WEIGHTS[idx]?.weight ?? 0;
  const within =
    total > 0 ? Math.min(1, Math.max(0, current / total)) : 0;
  return Math.min(
    99,
    Math.round(((completedWeight + phaseWeight * within) / totalWeight) * 100),
  );
}

export function formatEtaSeconds(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) {
    return "Calculando…";
  }
  if (seconds < 5) return "Menos de 5 s";
  if (seconds < 60) return `~${Math.ceil(seconds)} s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.ceil(seconds % 60);
  if (mins < 60) {
    return secs > 0 ? `~${mins} min ${secs} s` : `~${mins} min`;
  }
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `~${hours} h ${remMins} min`;
}
