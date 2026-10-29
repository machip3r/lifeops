/** LifeOps plantilla for mass póliza registration (download + parse use the same columns). */
import type { RegistryRow } from "./fields";

export type TemplateColumn = {
  key: Exclude<keyof RegistryRow, "index">;
  header: string;
  required?: boolean;
  /** Example value for the second row of the downloaded file */
  example: string;
  /** Column width (characters) in the xlsx */
  width: number;
};

/** Order = columns of the file. Headers are matched without accents / case, so users may retype them. */
export const TEMPLATE_COLUMNS: TemplateColumn[] = [
  { key: "contractNumber", header: "Número de póliza", required: true, example: "VI0001234567", width: 18 },
  { key: "clientName", header: "Contratante", required: true, example: "María López Hernández", width: 30 },
  { key: "consultantCode", header: "Clave del asesor", required: true, example: "109166", width: 16 },
  { key: "consultantName", header: "Nombre del asesor", example: "Ana Araujo Acosta", width: 28 },
  { key: "issueDate", header: "Fecha de emisión", required: true, example: "25/11/2025", width: 16 },
  { key: "paymentMethod", header: "Forma de pago", required: true, example: "Mensual", width: 14 },
  { key: "paymentChannel", header: "Conducto de cobro", example: "Cargo a tarjeta", width: 20 },
  { key: "collectionDay", header: "Día de cobro", example: "25", width: 12 },
  { key: "projectName", header: "Plan", example: "Imagina Ser 65", width: 24 },
  { key: "lineCode", header: "Ramo", example: "Vida", width: 14 },
  { key: "planClassification", header: "Clasificación del plan", example: "Tradicional", width: 20 },
  { key: "status", header: "Estado", example: "En vigor", width: 26 },
  { key: "currency", header: "Moneda", example: "Pesos", width: 10 },
  { key: "annualPremium", header: "Prima anual", example: "4089.48", width: 14 },
  { key: "insuredAmount", header: "Suma asegurada", example: "90000", width: 16 },
  { key: "annualPremiumMxn", header: "Prima anual en pesos", example: "4089.48", width: 18 },
  { key: "insuredAmountMxn", header: "Suma asegurada en pesos", example: "90000", width: 20 },
  { key: "deductibleMxn", header: "Deducible en pesos", example: "", width: 16 },
  { key: "endDate", header: "Fin de vigencia", example: "25/11/2062", width: 16 },
  { key: "insuredName", header: "Asegurado principal", example: "María López Hernández", width: 28 },
  { key: "clientEmail", header: "Correo del cliente", example: "maria@correo.com", width: 26 },
  { key: "clientPhone", header: "Teléfono del cliente", example: "3312345678", width: 18 },
  { key: "clientBirthDate", header: "Nacimiento del cliente", example: "03/03/1990", width: 18 },
  { key: "clientMaritalStatus", header: "Estado civil", example: "Soltero", width: 14 },
  { key: "clientRfc", header: "RFC del cliente", example: "", width: 16 },
  { key: "clientCurp", header: "CURP del cliente", example: "", width: 20 },
];

const csvCell = (value: string) => (/[",\n;]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Download the plantilla (header + one example row) as Excel or CSV. */
export async function downloadRegistryTemplate(format: "xlsx" | "csv"): Promise<void> {
  if (format === "csv") {
    const lines = [
      TEMPLATE_COLUMNS.map((c) => csvCell(c.header)).join(","),
      TEMPLATE_COLUMNS.map((c) => csvCell(c.example)).join(","),
    ];
    // BOM so Excel opens accents correctly
    saveBlob(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), "plantilla-polizas-lifeops.csv");
    return;
  }
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const header = TEMPLATE_COLUMNS.map((c) => ({
    value: c.required ? `${c.header} *` : c.header,
    fontWeight: "bold" as const,
    backgroundColor: c.required ? "#FBDBAC" : "#EDEDED",
  }));
  const example = TEMPLATE_COLUMNS.map((c) => ({ value: c.example, type: String, textColor: "#6B6B6B" }));
  await writeXlsxFile([header, example], {
    sheet: "Pólizas",
    columns: TEMPLATE_COLUMNS.map((c) => ({ width: c.width })),
    stickyRowsCount: 1,
  }).toFile("plantilla-polizas-lifeops.xlsx");
}
