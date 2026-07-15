import {
  MONTH_COLUMNS,
  collectionStatusLabel,
} from "@/lib/collections/constants";
import type { CollectionsGridRow } from "@/lib/collections/service";

/** Paid month cells are exported as `{day}*P` so the highlight is visible in the file. */
export function formatMonthCellForCsv(
  scheduledDay: number | null,
  collectionDay: number | null,
  paidAt: string | null,
): string {
  const day = scheduledDay ?? (!paidAt ? collectionDay : null);
  if (day == null && !paidAt) return "";
  const base = day != null ? String(day) : "";
  if (paidAt) {
    return base ? `${base}*P` : `*P`;
  }
  return base;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildCollectionsCsv(
  rows: CollectionsGridRow[],
  year: number,
): string {
  const headers = [
    "Clave",
    "Asesor",
    "Poliza",
    "Nombre cliente (contratante)",
    "Nombre proyecto",
    "Moneda",
    "Forma de pago",
    "Medio de cobro",
    "Prima al cobro",
    "Dia de cobro",
    "Estatus",
    ...MONTH_COLUMNS.map((m) => `${m.label} ${year}`),
  ];

  const lines = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => {
      const cells = [
        row.consultantCode ?? "",
        row.consultantName ?? "",
        row.contractNumber ?? "",
        row.clientName ?? "",
        row.projectName ?? "",
        row.currency ?? "",
        row.paymentMethod ?? "",
        row.paymentChannel ?? "",
        row.collectionPremium != null
          ? String(row.collectionPremium)
          : "",
        row.collectionDay != null ? String(row.collectionDay) : "",
        collectionStatusLabel(row.collectionStatus),
        ...MONTH_COLUMNS.map(({ month }) => {
          const cell = row.months[month - 1];
          return formatMonthCellForCsv(
            cell?.scheduledDay ?? null,
            row.collectionDay,
            cell?.paidAt ?? null,
          );
        }),
      ];
      return cells.map(csvEscape).join(",");
    }),
  ];

  // BOM helps Excel open UTF-8 with Spanish accents correctly.
  return `\uFEFF${lines.join("\n")}\n`;
}

export function downloadCollectionsCsv(
  rows: CollectionsGridRow[],
  year: number,
): void {
  const csv = buildCollectionsCsv(rows, year);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `cobranza-${year}.csv`;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
