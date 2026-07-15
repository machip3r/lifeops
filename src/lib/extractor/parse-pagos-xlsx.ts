import * as XLSX from "xlsx";

/** Same column order as HTML combined extract — feeds `importContractsFromTable`. */
export const COMBINED_IMPORT_HEADERS = [
  "Cliente",
  "Poliza",
  "Ramo",
  "Moneda",
  "Tipo Cambio",
  "Asesor",
  "Nombre Asesor",
  "Reclutador",
  "FECHA EMISION",
  "MES EMISION",
  "AÑO EMISION",
  "FECHA PAGO",
  "MES PAGO",
  "AÑO PAGO",
  "PRIMA PAGO 1",
  "FORMA DE PAGO",
  "PRIMA COMISION",
  "COMISION/HONORARIOS",
  "% COMISION",
  "MOVIMIENTO",
  "PRIMA COBRO",
  "ANTIGÜEDAD",
  "PRIMA PAGO 2",
  "PRIMA META",
] as const;

export type PagosXlsxParseResult = {
  headers: string[];
  rows: string[][];
  sheetName: string;
};

function normalizeHeaderKey(h?: string | null): string {
  return (h || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format as DD/MM/YYYY for `importContractsFromTable` parseDate. */
function formatDateDdMmYyyy(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  // Local components — SheetJS dates are local-midnight encoded as Date.
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function excelSerialToDate(serial: number): Date | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed) return null;
  return new Date(parsed.y, parsed.m - 1, parsed.d);
}

function cellToString(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatDateDdMmYyyy(value);
  if (typeof value === "number") {
    if (Number.isInteger(value)) return String(value);
    // Keep meaningful decimals (exchange rate, % commission)
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value).trim();
}

/**
 * Póliza / asesor codes from Excel — avoid scientific notation and .0 floats.
 * Plain `String(1e21)` becomes `"1e+21"` which fails import Zod patterns.
 */
function cellIdToString(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatDateDdMmYyyy(value);
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    if (Math.abs(value - rounded) < 1e-9) {
      // Prefer fixed digits (no grouping / no exponential)
      return rounded.toLocaleString("en-US", { useGrouping: false });
    }
    return String(value).replace(/,/g, "").trim();
  }
  return String(value)
    .trim()
    .replace(/,/g, "")
    .replace(/\s+/g, "");
}

function cellToDateString(value: unknown): string {
  if (value == null || value === "") return "";
  if (value instanceof Date) return formatDateDdMmYyyy(value);
  if (typeof value === "number") {
    const asDate = excelSerialToDate(value);
    return asDate ? formatDateDdMmYyyy(asDate) : "";
  }
  const s = String(value).trim();
  if (!s) return "";
  // Already DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return formatDateDdMmYyyy(d);
  return s;
}

function monthYearFromDdMmYyyy(dateStr: string): { month: string; year: string } {
  const parts = dateStr.split("/");
  if (parts.length !== 3) return { month: "", year: "" };
  return {
    month: String(Number.parseInt(parts[1], 10) || ""),
    year: parts[2] || "",
  };
}

function isHeaderLikeRow(
  client: string,
  poliza: string,
  asesor: string,
): boolean {
  const c = normalizeHeaderKey(client);
  const p = normalizeHeaderKey(poliza);
  const a = normalizeHeaderKey(asesor);
  return (
    c === "CLIENTE" ||
    p === "POLIZA" ||
    a === "ASESOR" ||
    c === "RAMO" ||
    p === "RAMO"
  );
}

/**
 * Parse a pagos / comisiones .xlsx (first sheet) into the same shape as HTML extract.
 */
export function parsePagosXlsx(buffer: ArrayBuffer): PagosXlsxParseResult {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("El archivo Excel no tiene hojas.");
  }
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<(string | number | Date | boolean | null)[]>(
    sheet,
    { header: 1, defval: "", blankrows: false, raw: true },
  );

  if (rawRows.length < 2) {
    throw new Error("El archivo Excel no tiene filas de datos.");
  }

  const headerRow = rawRows[0].map((c) => String(c ?? "").trim());
  const colIndex = new Map<string, number>();
  headerRow.forEach((h, idx) => {
    const key = normalizeHeaderKey(h);
    if (key && !colIndex.has(key)) colIndex.set(key, idx);
  });

  const required = ["CLIENTE", "POLIZA", "ASESOR"];
  for (const key of required) {
    if (!colIndex.has(key)) {
      throw new Error(
        `Falta la columna requerida "${key}" en el Excel. Encabezados: ${headerRow.filter(Boolean).join(", ")}`,
      );
    }
  }

  const get = (
    row: (string | number | Date | boolean | null)[],
    ...aliases: string[]
  ): unknown => {
    for (const alias of aliases) {
      const idx = colIndex.get(normalizeHeaderKey(alias));
      if (idx === undefined) continue;
      return row[idx];
    }
    return "";
  };

  const rows: string[][] = [];

  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (!raw || raw.length === 0) continue;

    const client = cellToString(get(raw, "CLIENTE"));
    const poliza = cellIdToString(get(raw, "POLIZA"));
    const asesor = cellIdToString(get(raw, "ASESOR"));

    if (!client && !poliza) continue;
    if (isHeaderLikeRow(client, poliza, asesor)) continue;
    if (!client || !asesor) continue;

    const issueDate = cellToDateString(get(raw, "FECHA EMISION"));
    const paymentDate = cellToDateString(get(raw, "FECHA PAGO"));
    const issueMy = monthYearFromDdMmYyyy(issueDate);
    const payMy = monthYearFromDdMmYyyy(paymentDate);

    const mesEmision =
      cellToString(get(raw, "MES EMISION")) || issueMy.month;
    const anioEmision =
      cellToString(get(raw, "AÑO EMISION", "ANO EMISION")) || issueMy.year;
    const mesPago = cellToString(get(raw, "MES PAGO")) || payMy.month;
    const anioPago =
      cellToString(get(raw, "AÑO PAGO", "ANO PAGO")) || payMy.year;

    rows.push([
      client,
      poliza,
      cellToString(get(raw, "RAMO")),
      cellToString(get(raw, "MONEDA")),
      cellToString(get(raw, "TIPO CAMBIO")),
      asesor,
      cellToString(get(raw, "NOMBRE ASESOR")),
      cellToString(get(raw, "RECLUTADOR")),
      issueDate,
      mesEmision,
      anioEmision,
      paymentDate,
      mesPago,
      anioPago,
      cellToString(get(raw, "PRIMA PAGO", "PRIMA PAGO 1")),
      cellToString(get(raw, "FORMA DE PAGO")),
      cellToString(get(raw, "PRIMA COMISION")),
      cellToString(get(raw, "COMISION/HONORARIOS", "COMISION HONORARIOS")),
      cellToString(get(raw, "% COMISION", "PORCENTAJE COMISION")),
      cellToString(get(raw, "MOVIMIENTO")),
      cellToString(get(raw, "PRIMA COBRO")),
      cellToString(get(raw, "ANTIGÜEDAD", "ANTIGUEDAD")),
      cellToString(get(raw, "PRIMA PAGO2", "PRIMA PAGO 2")),
      cellToString(get(raw, "PRIMA META")),
    ]);
  }

  if (rows.length === 0) {
    throw new Error("No se encontraron filas válidas en el Excel.");
  }

  return {
    headers: [...COMBINED_IMPORT_HEADERS],
    rows,
    sheetName,
  };
}
