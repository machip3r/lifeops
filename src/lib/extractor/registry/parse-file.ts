/** Browser side: read a Mina de Oro / plantilla file (CSV or Excel) into RegistryRow[]. */
import { normalizeClientName } from "@/lib/clients/name-match";
import { normalizeHeader } from "@/lib/extractor/import/parse";
import { LIMITS } from "@/lib/validation/schemas";
import {
  toAmount,
  toContractNumber,
  toCurrency,
  toEmail,
  toIsoDate,
  toLineCode,
  toPaymentMethod,
  toPhone,
  toStatus,
  toTaxId,
  toText,
  type RegistryRow,
  type RegistrySource,
} from "./fields";
import { TEMPLATE_COLUMNS } from "./template";

type Cell = string | number | boolean | Date | null;

export type ParsedRegistryFile = {
  source: RegistrySource;
  rows: RegistryRow[];
  errors: Array<{ row: number; error: string }>;
  /** Mina de Oro: date printed on the report (YYYY-MM-DD) = data cut-off */
  reportDate: string | null;
  /** Mina de Oro: distinct «No. Promotoría» values in the file */
  agencyCodes: string[];
};

/** RFC 4180-ish CSV with `,` or `;` (detected from the header line), quotes and CRLF. */
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, "");
  const firstLines = clean.split(/\r?\n/).slice(0, 6).join("\n");
  const delimiter = (firstLines.match(/;/g)?.length ?? 0) > (firstLines.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

async function readCells(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) {
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as unknown as Cell[][];
  }
  return parseCsv(await file.text());
}

const isBlank = (row: Cell[]) => row.every((c) => c == null || String(c).trim() === "");

/** Mina de Oro: the header row has "Número de la Póliza"; above it, title + report date. */
function mapMinaDeOro(cells: Cell[][], headerAt: number): ParsedRegistryFile {
  const headers = cells[headerAt].map((h) => normalizeHeader(String(h ?? "")));
  const col = (key: string) => headers.indexOf(key);
  const idx = {
    agency: col("NOPROMOTORIA"),
    consultantCode: col("CLAVEDELASESOR"),
    consultantName: col("NOMBREDELASESOR"),
    status: col("ESTATUS"),
    plan: col("NOMBREDELPLAN"),
    number: col("NUMERODELAPOLIZA"),
    issue: col("FECHADEEMISION"),
    channel: col("METODODEPAGO"),
    insuranceType: col("TIPODESEGURO"),
    paymentMethod: col("FORMADEPAGO"),
    client: col("CONTRATANTE"),
    insured: col("PERSONAASEGURADAPRINCIPAL"),
    insuredAmountMxn: col("SUMAASEGURADACONVERTIDO"),
    insuredAmount: col("SUMAASEGURADA"),
    premiumMxn: col("PRIMAANUALEMITIDOCONVERTIDO"),
    premium: col("PRIMAANUALEMITIDO"),
    deductibleMxn: col("DEDUCIBLECONVERTIDO"),
    email: col("EMAILDEPREFERENCIA"),
    phone: col("TELEFONODEPREFERENCIA"),
    marital: col("ESTADOCIVIL"),
    birth: col("FECHADENACIMIENTO"),
    end: col("FECHATERMINACIONDECONTRATO"),
    classification: col("CLASIFICACIONDELPLAN"),
  };
  let reportDate: string | null = null;
  for (const row of cells.slice(0, headerAt)) {
    reportDate = reportDate ?? row.map(toIsoDate).find(Boolean) ?? null;
  }

  const rows: RegistryRow[] = [];
  const errors: ParsedRegistryFile["errors"] = [];
  const agencyCodes = new Set<string>();
  cells.slice(headerAt + 1).forEach((row, i) => {
    if (isBlank(row)) return;
    const at = (n: number) => (n >= 0 ? row[n] : null);
    const agency = toText(at(idx.agency), 32);
    if (agency) agencyCodes.add(agency);
    const index = headerAt + i + 2;
    const contractNumber = toContractNumber(at(idx.number));
    const clientName = normalizeClientName(String(at(idx.client) ?? "")).slice(0, LIMITS.personName);
    const consultantCode = toText(at(idx.consultantCode), LIMITS.consultantCode) ?? "";
    if (!contractNumber || !clientName || !consultantCode) {
      errors.push({ row: index, error: "Falta número de póliza, contratante o clave del asesor." });
      return;
    }
    const plan = toText(at(idx.plan), 120);
    const original = toAmount(at(idx.insuredAmount)) ?? toAmount(at(idx.premium));
    const converted = toAmount(at(idx.insuredAmountMxn)) ?? toAmount(at(idx.premiumMxn));
    // The report has no currency column: infer it from the conversion factor
    const ratio = original && converted ? converted / original : null;
    const currency: RegistryRow["currency"] =
      ratio == null
        ? null
        : Math.abs(ratio - 1) < 0.01
          ? "PESO"
          : /\bUDI/i.test(plan ?? "") || (ratio >= 5 && ratio < 13)
            ? "UDI"
            : ratio >= 13 && ratio <= 30
              ? "DOLAR"
              : null;
    rows.push({
      index,
      contractNumber,
      clientName,
      consultantCode,
      consultantName: toText(at(idx.consultantName), LIMITS.personName),
      issueDate: toIsoDate(at(idx.issue)),
      paymentMethod: toPaymentMethod(at(idx.paymentMethod)),
      paymentChannel: toText(at(idx.channel), 60),
      projectName: plan,
      lineCode: toLineCode(at(idx.insuranceType), contractNumber),
      planClassification: toText(at(idx.classification), 40),
      insuredName: toText(at(idx.insured), 120),
      status: toStatus(at(idx.status)),
      currency,
      annualPremium: toAmount(at(idx.premium))?.toString() ?? null,
      insuredAmount: toAmount(at(idx.insuredAmount))?.toString() ?? null,
      annualPremiumMxn: toAmount(at(idx.premiumMxn)),
      insuredAmountMxn: toAmount(at(idx.insuredAmountMxn)),
      deductibleMxn: toAmount(at(idx.deductibleMxn)),
      endDate: toIsoDate(at(idx.end)),
      collectionDay: null,
      clientEmail: toEmail(at(idx.email)),
      clientPhone: toPhone(at(idx.phone)),
      clientBirthDate: toIsoDate(at(idx.birth)),
      clientMaritalStatus: toText(at(idx.marital), 40),
      clientRfc: null,
      clientCurp: null,
    });
  });
  return { source: "mina_de_oro", rows, errors, reportDate, agencyCodes: [...agencyCodes] };
}

/** LifeOps plantilla: header row = TEMPLATE_COLUMNS (required ones may end in " *"). */
function mapTemplate(cells: Cell[][], headerAt: number): ParsedRegistryFile {
  const headers = cells[headerAt].map((h) => normalizeHeader(String(h ?? "")));
  const position = new Map(TEMPLATE_COLUMNS.map((c) => [c.key, headers.indexOf(normalizeHeader(c.header))]));
  const get = (row: Cell[], key: (typeof TEMPLATE_COLUMNS)[number]["key"]) => {
    const n = position.get(key) ?? -1;
    return n >= 0 ? row[n] : null;
  };
  const exampleNumber = toContractNumber(TEMPLATE_COLUMNS[0].example);

  const rows: RegistryRow[] = [];
  const errors: ParsedRegistryFile["errors"] = [];
  cells.slice(headerAt + 1).forEach((row, i) => {
    if (isBlank(row)) return;
    const index = headerAt + i + 2;
    const contractNumber = toContractNumber(get(row, "contractNumber"));
    if (contractNumber === exampleNumber) return; // the example row of the download
    const clientName = normalizeClientName(String(get(row, "clientName") ?? "")).slice(0, LIMITS.personName);
    const consultantCode = toText(get(row, "consultantCode"), LIMITS.consultantCode) ?? "";
    const issueDate = toIsoDate(get(row, "issueDate"));
    const paymentMethod = toPaymentMethod(get(row, "paymentMethod"));
    const missing = [
      !contractNumber && "número de póliza",
      !clientName && "contratante",
      !consultantCode && "clave del asesor",
      !issueDate && "fecha de emisión",
      !paymentMethod && "forma de pago (Anual, Semestral, Trimestral o Mensual)",
    ].filter(Boolean);
    if (missing.length > 0) {
      errors.push({ row: index, error: `Falta o no es válido: ${missing.join(", ")}.` });
      return;
    }
    const day = Number(String(get(row, "collectionDay") ?? "").replace(/\D/g, ""));
    rows.push({
      index,
      contractNumber,
      clientName,
      consultantCode,
      consultantName: toText(get(row, "consultantName"), LIMITS.personName),
      issueDate,
      paymentMethod,
      paymentChannel: toText(get(row, "paymentChannel"), 60),
      projectName: toText(get(row, "projectName"), 120),
      lineCode: toLineCode(get(row, "lineCode"), contractNumber),
      planClassification: toText(get(row, "planClassification"), 40),
      insuredName: toText(get(row, "insuredName"), 120),
      status: toStatus(get(row, "status")),
      currency: toCurrency(get(row, "currency")),
      annualPremium: toAmount(get(row, "annualPremium"))?.toString() ?? null,
      insuredAmount: toAmount(get(row, "insuredAmount"))?.toString() ?? null,
      annualPremiumMxn: toAmount(get(row, "annualPremiumMxn")),
      insuredAmountMxn: toAmount(get(row, "insuredAmountMxn")),
      deductibleMxn: toAmount(get(row, "deductibleMxn")),
      endDate: toIsoDate(get(row, "endDate")),
      collectionDay: day >= 1 && day <= 31 ? day : null,
      clientEmail: toEmail(get(row, "clientEmail")),
      clientPhone: toPhone(get(row, "clientPhone")),
      clientBirthDate: toIsoDate(get(row, "clientBirthDate")),
      clientMaritalStatus: toText(get(row, "clientMaritalStatus"), 40),
      clientRfc: toTaxId(get(row, "clientRfc"), [12, 13]),
      clientCurp: toTaxId(get(row, "clientCurp"), [18]),
    });
  });
  return { source: "template", rows, errors, reportDate: null, agencyCodes: [] };
}

/** Read and map a file; `expected` picks the parser (the other one is tried if headers do not match). */
export async function parseRegistryFile(file: File, expected: RegistrySource): Promise<ParsedRegistryFile> {
  const name = file.name.toLowerCase();
  if (!/\.(csv|xlsx)$/.test(name)) {
    throw new Error("Sube un archivo de Excel (.xlsx) o CSV (.csv).");
  }
  if (file.size > 15 * 1024 * 1024) throw new Error("El archivo pesa más de 15 MB.");
  const cells = (await readCells(file)).slice(0, LIMITS.importRows + 10);

  const minaHeader = cells.findIndex((row) => row.some((c) => normalizeHeader(String(c ?? "")) === "NUMERODELAPOLIZA"));
  const templateKey = normalizeHeader(TEMPLATE_COLUMNS[0].header);
  const templateHeader = cells.findIndex((row) => row.some((c) => normalizeHeader(String(c ?? "")) === templateKey));

  if (expected === "mina_de_oro" && minaHeader >= 0) return mapMinaDeOro(cells, minaHeader);
  if (expected === "template" && templateHeader >= 0) return mapTemplate(cells, templateHeader);
  if (minaHeader >= 0) return mapMinaDeOro(cells, minaHeader);
  if (templateHeader >= 0) return mapTemplate(cells, templateHeader);
  throw new Error(
    expected === "mina_de_oro"
      ? "No reconocemos este archivo como la Mina de Oro: falta la columna «Número de la Póliza»."
      : "No reconocemos este archivo como la plantilla de LifeOps: descárgala de nuevo y llena esas columnas.",
  );
}
