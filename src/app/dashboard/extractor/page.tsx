'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  FileUp,
  HelpCircle,
  Upload,
  X,
} from 'lucide-react';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { authFetch } from '@/lib/api-client';
import { db } from '@/lib/db';
import {
  chunkArray,
  IMPORT_BATCH_SIZE,
} from '@/lib/extractor/batch';
import {
  formatEtaSeconds,
  type ImportProgress,
} from '@/lib/extractor/import-progress';
import { DateInput } from '@/components/ui/date-input';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { AppDialog } from '@/components/ui/app-dialog';
import {
  MissingConsultantsDialog,
  type MissingConsultantDraft,
} from '@/components/extractor/missing-consultants-dialog';
import { cn } from '@/lib/utils';
import { useNavigationBlock } from '@/contexts/navigation-guard';

interface ContractorMetadata {
  policyholder?: string;
  contractNumber?: string;
  officeName?: string;
  currency?: string;
  exchangeRate?: string;
  consultantCode?: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
  metadata?: ContractorMetadata;
  sectionName?: string;
}

/** Unified step-2/3 row: emission + optional prior payment for new policies. */
type ImportDateRow = {
  key: string;
  contractNumber: string;
  clientName: string;
  consultantCode: string;
  rowIndexes: number[];
  /** ISO YYYY-MM-DD from extract or user */
  issueDate: string;
  /** True when HTML had no emission date (input shown by default). */
  issueMissing: boolean;
  needsPriorPayment: boolean;
  priorPaymentDate: string;
};

function normalizeHeaderKey(h?: string | null): string {
  return (h || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

/** Parse DD/MM/YYYY, D/M/YYYY or ISO → YYYY-MM-DD */
function parseFlexibleDateToIso(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!m) return null;
  const dd = m[1].padStart(2, '0');
  const mm = m[2].padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function todayIsoDate(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Calendar day before `iso` (YYYY-MM-DD), or null if invalid. */
function dayBeforeIso(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function minIsoDate(a: string, b: string): string {
  return a <= b ? a : b;
}

function isoToDdMmYyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

/** Most common FECHA PAGO in the table (tie → latest). */
function suggestFileIssueDateFromPaymentColumn(
  headers: string[],
  rows: string[][],
): string {
  const map = new Map(headers.map((h, i) => [normalizeHeaderKey(h), i]));
  const idx = map.get('FECHAPAGO') ?? 11;
  const counts = new Map<string, number>();
  for (const row of rows) {
    const iso = parseFlexibleDateToIso(row[idx] ?? '');
    if (!iso) continue;
    counts.set(iso, (counts.get(iso) ?? 0) + 1);
  }
  if (counts.size === 0) return '';
  let best = '';
  let bestCount = -1;
  for (const [iso, count] of counts) {
    if (count > bestCount || (count === bestCount && iso > best)) {
      best = iso;
      bestCount = count;
    }
  }
  return best;
}

function headerIndexMap(headers: string[]): Map<string, number> {
  return new Map(headers.map((h, i) => [normalizeHeaderKey(h), i]));
}

// Only these columns are extracted, shown in table, and saved to DB (order matches HTML table indices)
const ALLOWED_DETAIL_COLUMNS: { index: number; header: string }[] = [
  { index: 2, header: 'FECHA EMISION' },
  { index: 5, header: 'FECHA PAGO' },
  { index: 6, header: 'PRIMA PAGO' },
  { index: 7, header: 'FORMA DE PAGO' },
  { index: 11, header: 'COMISION/HONORARIOS' },
  { index: 13, header: '% COMISION' },
  { index: 15, header: 'PRIMA COBRO' },
  { index: 18, header: 'ANTIGÜEDAD' },
  { index: 23, header: 'PRIMA META' },
  { index: 14, header: 'MOVIMIENTO' },
  { index: 10, header: 'PRIMA COMISION' },
];

interface UploadedFile {
  name: string;
  content: string;
}

/** When true, promotoría registers/invites new asesores in a dialog instead of auto-create. */
const REQUIRE_MANUAL_CONSULTANT_CREDENTIALS =
  process.env.NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS === 'true';

function ExtractorPageContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [tables, setTables] = useState<TableData[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: number; error: string }>; warnings: Array<{ row: number; message: string }> } | null>(null);
  const [showImportOutcomeDialog, setShowImportOutcomeDialog] = useState(false);
  const [showConsultantDialog, setShowConsultantDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<{ contracts: string[]; details: Array<{ contract: string; ticket: string; row: number }> }>({ contracts: [], details: [] });
  const [missingConsultants, setMissingConsultants] = useState<
    MissingConsultantDraft[]
  >([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const continueLockRef = useRef(false);
  const [showImportDatesDialog, setShowImportDatesDialog] = useState(false);
  const [dialogFileIssueDate, setDialogFileIssueDate] = useState('');
  const [importDateRows, setImportDateRows] = useState<ImportDateRow[]>([]);
  const [importDateErrors, setImportDateErrors] = useState<Record<string, string>>({});
  /** Keys where extracted emission date is being edited inline. */
  const [editingIssueKeys, setEditingIssueKeys] = useState<Record<string, boolean>>({});
  /** Missing asesor codes previewed on step 3 (manual create on import). */
  const [summaryMissingConsultants, setSummaryMissingConsultants] = useState<
    Array<{ code: string; name?: string }>
  >([]);
  const [summaryMissingLoading, setSummaryMissingLoading] = useState(false);
  /** 1 = archivos, 2 = importación (fechas), 3 = resumen */
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [pendingImportTable, setPendingImportTable] = useState<TableData | null>(null);
  const [confirmedImportMeta, setConfirmedImportMeta] = useState<{
    fileIssueDate: string;
    priorPaymentByContract: Record<string, string>;
  } | null>(null);

  const importInProgress =
    step > 1 ||
    uploadedFiles.length > 0 ||
    isExtracting ||
    isCheckingDuplicates ||
    isImporting;

  useNavigationBlock(importInProgress, {
    title: 'Importación en curso',
    description: isImporting
      ? 'Hay una importación en proceso. Si cambias de página, cierras sesión o haces otra acción, no vas a ver el resultado.'
      : 'Estás importando datos. Si cambias de página, se pierde el avance, incluidas las fechas que llevas.',
  });


  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) ?? '');
      reader.onerror = () => reject(new Error('Error leyendo archivo'));
      reader.readAsText(file, 'UTF-8');
    });
  };

  /** Decode quoted-printable text (minimal implementation for MHTML HTML parts). */
  const decodeQuotedPrintable = (input: string): string => {
    // Handle soft line breaks: "=\r\n" or "=\n"
    const withoutSoftBreaks = input.replace(/=\r?\n/g, '');
    // Replace =XX hex sequences with the corresponding character
    return withoutSoftBreaks.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return _;
      }
    });
  };

  /** Extract HTML from MHTML (multipart/related) content for DOMParser. Returns plain HTML or original if not MHTML. */
  const extractHtmlFromMhtml = (rawContent: string): string => {
    const trimmed = rawContent.trimStart();
    const lower = trimmed.toLowerCase();
    // Only treat as MHTML if it looks like multipart (has boundary)
    if (!lower.includes('content-type:') && !lower.includes('mime-version:')) {
      return rawContent;
    }
    const boundaryMatch = trimmed.slice(0, 2048).match(/boundary\s*=\s*["']?([^"'\s;]+)["']?/i);
    const boundary = boundaryMatch ? boundaryMatch[1].trim() : null;
    if (!boundary) {
      return rawContent;
    }
    const lineDelim = rawContent.includes('\r\n') ? '\r\n' : '\n';
    const lines = trimmed.split(lineDelim);
    const parts: string[] = [];
    let current: string[] = [];
    const boundaryLine = `--${boundary}`;
    const boundaryEnd = `--${boundary}--`;
    for (const line of lines) {
      if (line === boundaryLine || line === boundaryEnd) {
        if (current.length) {
          parts.push(current.join(lineDelim));
          current = [];
        }
        if (line === boundaryEnd) break;
        continue;
      }
      current.push(line);
    }
    if (current.length) parts.push(current.join(lineDelim));
    for (const part of parts) {
      const sep = part.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
      const idx = part.indexOf(sep);
      const headerBlock = idx >= 0 ? part.slice(0, idx) : '';
      let body = idx >= 0 ? part.slice(idx + sep.length).trim() : part.trim();
      const headerLower = headerBlock.toLowerCase();
      const isHtmlByHeader = headerLower.includes('text/html');
      const isHtmlByContent = body.toLowerCase().slice(0, 50).includes('<!doctype') || body.toLowerCase().slice(0, 20).startsWith('<html');
      if (body.length > 100 && (isHtmlByHeader || isHtmlByContent)) {
        // Decode quoted-printable HTML parts before returning
        if (headerLower.includes('quoted-printable')) {
          body = decodeQuotedPrintable(body);
        }
        return body;
      }
    }
    return rawContent;
  };

  const parseHTMLTables = (htmlContent: string): TableData[] => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const allTables = doc.querySelectorAll('table');
    const processedTables = new Set<Element>(); // Track processed tables to avoid duplicates

    // Collect all sections from all tables
    type SectionType = { metadata: ContractorMetadata; rows: string[][]; startIndex: number };
    const allSections: SectionType[] = [];
    let mainHeaders: string[] = [];

    allTables.forEach((table) => {
      // Skip if already processed
      if (processedTables.has(table)) {
        return;
      }

      // Check if this table is nested inside another table
      let parent = table.parentElement;
      let isNested = false;
      while (parent && parent !== doc.body && parent !== doc.documentElement) {
        if (parent.tagName === 'TABLE' || parent.tagName === 'TBODY' || parent.tagName === 'THEAD' || parent.tagName === 'TFOOT') {
          if (parent.tagName === 'TABLE') {
            isNested = true;
            break;
          }
          const tableParent = parent.parentElement;
          if (tableParent && tableParent.tagName === 'TABLE') {
            isNested = true;
            break;
          }
        }
        parent = parent.parentElement;
      }

      if (isNested) {
        return;
      }

      processedTables.add(table);
      const allRows = Array.from(table.querySelectorAll('tr'));
      const headers: string[] = [];
      let headerRowIndex = -1;

      // Find the main table header row
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        const cells = row.querySelectorAll('td, th');

        if (row.classList.contains('subtituloazul') && cells.length > 5) {
          const cellTexts = Array.from(cells).map(cell => cell.textContent?.trim() || '');
          const hasHeaderWords = cellTexts.some(text =>
            ['RECIBO', 'PLAN', 'FECHA', 'PRODUCTO', 'PRIMA', 'COMISION'].some(word =>
              text.toUpperCase().includes(word)
            )
          );

          if (hasHeaderWords) {
            headerRowIndex = i;
            cells.forEach(cell => {
              const text = cell.textContent?.trim() || '';
              if (text) {
                headers.push(text);
              }
            });
            break;
          }
        }
      }

      if (headers.length === 0) {
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (headerRow) {
          const headerCells = headerRow.querySelectorAll('td, th');
          headerCells.forEach(cell => {
            const text = cell.textContent?.trim() || '';
            if (text) {
              headers.push(text);
            }
          });
        }
      }

      // Use the first set of headers found as main headers
      if (headers.length > 0 && mainHeaders.length === 0) {
        mainHeaders = headers;
      }

      // Group rows by CONTRATANTE sections
      const sections: SectionType[] = [];
      let currentSection: SectionType | null = null;
      const seenMetadataKeys = new Set<string>();

      allRows.forEach((row, rowIndex) => {
        const cells = Array.from(row.querySelectorAll('td'));
        const cellTexts = cells.map(cell => cell.textContent?.trim() || '');

        const isMetadataRow = cellTexts.some(text =>
          ['CONTRATANTE', 'POLIZA', 'OFICINA', 'MONEDA', 'TIPO DE CAMBIO', 'ASESOR'].some(label =>
            text.toUpperCase().includes(label)
          )
        );

        if (isMetadataRow) {
          const metadata: ContractorMetadata = {};
          const cellElements = Array.from(cells);

          for (let i = 0; i < cellElements.length; i++) {
            const cell = cellElements[i];
            const text = cell.textContent?.trim() || '';
            const upperText = text.toUpperCase();

            const isLabel = cell.classList.contains('subtituloazul') ||
              ['CONTRATANTE', 'POLIZA', 'OFICINA', 'MONEDA', 'TIPO DE CAMBIO', 'ASESOR'].some(label =>
                upperText.includes(label)
              );

            if (isLabel) {
              const nextCell = cellElements[i + 1];
              const value = nextCell ? nextCell.textContent?.trim() || '' : '';

              if (upperText.includes('CONTRATANTE')) metadata.policyholder = value;
              else if (upperText.includes('POLIZA')) metadata.contractNumber = value;
              else if (upperText.includes('OFICINA')) metadata.officeName = value;
              else if (upperText.includes('MONEDA')) metadata.currency = value;
              else if (upperText.includes('TIPO DE CAMBIO')) metadata.exchangeRate = value;
              else if (upperText.includes('ASESOR')) metadata.consultantCode = value;

              i++;
            }
          }

          const metadataKey = `${metadata.policyholder || ''}_${metadata.contractNumber || ''}_${rowIndex}`;

          if (!seenMetadataKeys.has(metadataKey)) {
            if (currentSection !== null && currentSection.rows.length > 0) {
              sections.push(currentSection);
            }

            seenMetadataKeys.add(metadataKey);

            currentSection = {
              metadata,
              rows: [],
              startIndex: rowIndex
            };
          }
        } else if (row.classList.contains('GridRow') && currentSection !== null && rowIndex > headerRowIndex) {
          const rowText = cellTexts.join(' ').toUpperCase();
          if (rowText.includes('UEN PERSONAS') || rowText.trim() === '') {
            return;
          }

          const rowData: string[] = [];
          cells.forEach(cell => {
            const text = cell.textContent?.trim() || '';
            rowData.push(text);
          });

          if (rowData.length > 0 && rowData.some(cell => cell !== '' && cell !== '&nbsp;' && cell.trim() !== '') && currentSection !== null) {
            currentSection.rows.push(rowData);
          }
        }
      });

      if (currentSection !== null) {
        const sectionToAdd: SectionType = currentSection;
        if (sectionToAdd.rows.length > 0) {
          sections.push(sectionToAdd);
        }
      }

      // Add all sections from this table to the main collection
      allSections.push(...sections);
    });

    // Combine all sections into a single table
    if (allSections.length === 0) {
      return [];
    }

    // Helper function to determine TIPO POLIZA from poliza number
    const getPolicyType = (contractNumber: string | null | undefined): string => {
      if (!contractNumber) return '';
      const upper = contractNumber.trim().toUpperCase();
      if (upper.startsWith('VI')) return 'VI';
      if (upper.startsWith('GM')) return 'GMM';
      return '';
    };

    const normalizePaymentMethodDisplay = (raw: string): string => {
      const trimmed = raw.trim();
      if (!trimmed) return '';
      const lower = trimmed.toLowerCase();

      let label: string | null = null;
      if (lower === '1' || lower === '01' || lower === 'anual') {
        label = 'Anual';
      } else if (lower === '2' || lower === '02' || lower === 'semestral') {
        label = 'Semestral';
      } else if (lower === '4' || lower === '04' || lower === 'trimestral') {
        label = 'Trimestral';
      } else if (lower === '5' || lower === '05' || lower === 'mensual') {
        label = 'Mensual';
      }

      if (!label) return trimmed;
      // Show normalized label plus original value when they differ
      return trimmed.toLowerCase() === label.toLowerCase() ? label : `${label} (${trimmed})`;
    };

    // Only include allowed columns (metadata + TIPO POLIZA + 11 detail columns)
    const combinedHeaders = [
      'Cliente',
      'Poliza',
      'Ramo',
      'Moneda',
      'Tipo Cambio',
      'Asesor',
      'Nombre Asesor',
      'Reclutador',
      'FECHA EMISION',
      'MES EMISION',
      'AÑO EMISION',
      'FECHA PAGO',
      'MES PAGO',
      'AÑO PAGO',
      'PRIMA PAGO 1',
      'FORMA DE PAGO',
      'PRIMA COMISION',
      'COMISION/HONORARIOS',
      '% COMISION',
      'MOVIMIENTO',
      'PRIMA COBRO',
      'ANTIGÜEDAD',
      'PRIMA PAGO 2',
      'PRIMA META',
    ];

    const combinedRows: string[][] = [];
    allSections.forEach((section) => {
      section.rows.forEach((row) => {
        const allowedCells = ALLOWED_DETAIL_COLUMNS.map((c) => (row[c.index] ?? '').trim());
        const contractNumber = section.metadata.contractNumber || '';

        // Find both PRIMA PAGO columns by header, using left-to-right order in the original HTML
        const normalizeHeader = (h?: string | null): string =>
          (h || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '');

        const primaPagoHeaderIndices: number[] = [];
        mainHeaders.forEach((h, idx) => {
          if (normalizeHeader(h) === 'PRIMAPAGO') {
            primaPagoHeaderIndices.push(idx);
          }
        });

        const premiumPayment1Index = primaPagoHeaderIndices[0] ?? -1;
        const premiumPayment2Index = primaPagoHeaderIndices[1] ?? -1;

        const issueDate = allowedCells[0] || '';
        let issueMonth = '';
        let issueYear = '';
        if (issueDate) {
          const parts = issueDate.split('/');
          if (parts.length === 3) {
            issueMonth = parts[1]?.padStart(2, '0') || '';
            issueYear = parts[2] || '';
          }
        }

        const paymentDate = allowedCells[1] || '';
        let paymentMonth = '';
        let paymentYear = '';
        if (paymentDate) {
          const parts = paymentDate.split('/');
          if (parts.length === 3) {
            paymentMonth = parts[1]?.padStart(2, '0') || '';
            paymentYear = parts[2] || '';
          }
        }

        const premiumPayment1 =
          premiumPayment1Index >= 0 ? (row[premiumPayment1Index] ?? '').trim() : allowedCells[2] || '';
        const paymentMethodRaw = allowedCells[3] || '';
        const paymentMethod = normalizePaymentMethodDisplay(paymentMethodRaw);
        const commissionHonoraries = allowedCells[4] || '';
        const commissionPercentage = allowedCells[5] || '';
        const collectionPremium = allowedCells[6] || '';
        const seniority = allowedCells[7] || '';
        const targetPremium = allowedCells[8] || '';
        const movement = allowedCells[9] || '';
        const commissionPremium = allowedCells[10] || '';
        const premiumPayment2 =
          premiumPayment2Index >= 0 ? (row[premiumPayment2Index] ?? '').trim() : premiumPayment1;

        combinedRows.push([
          section.metadata.policyholder || '',
          contractNumber,
          getPolicyType(contractNumber),
          section.metadata.currency || '',
          section.metadata.exchangeRate || '',
          section.metadata.consultantCode || '',
          '', // Consultant name (editable)
          '', // Recruiter (editable)
          issueDate,
          issueMonth,
          issueYear,
          paymentDate,
          paymentMonth,
          paymentYear,
          premiumPayment1,
          paymentMethod,
          commissionPremium,
          commissionHonoraries,
          commissionPercentage,
          movement,
          collectionPremium,
          seniority,
          premiumPayment2,
          targetPremium,
        ]);
      });
    });

    return [{
      headers: combinedHeaders,
      rows: combinedRows,
      metadata: undefined,
      sectionName: 'combined'
    }];
  };

  const convertToCSV = (table: TableData): string => {
    const lines: string[] = [];

    // Add headers
    lines.push(table.headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    // Add rows
    table.rows.forEach(row => {
      const csvRow = row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',');
      lines.push(csvRow);
    });

    return lines.join('\n');
  };

  const downloadCSV = (table: TableData) => {
    const csv = convertToCSV(table);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    const filename = `${fileName || 'export'}.csv`;
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadAllCSV = () => {
    if (tables.length > 0) {
      downloadCSV(tables[0]);
    }
  };

  const addFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    const htmlFiles = fileArray.filter((f) => {
      const name = f.name.toLowerCase();
      return (
        f.type === 'text/html' ||
        name.endsWith('.html') ||
        name.endsWith('.htm') ||
        name.endsWith('.mhtml') ||
        name.endsWith('.mht')
      );
    });
    if (htmlFiles.length === 0) {
      toast.error('Selecciona archivos HTML o MHTML (.html, .htm, .mhtml, .mht)');
      return;
    }
    try {
      const newEntries: UploadedFile[] = await Promise.all(
        htmlFiles.map(async (file) => ({
          name: file.name,
          content: await readFileAsText(file),
        }))
      );
      setUploadedFiles((prev) => [...prev, ...newEntries]);
      setTables([]);
      setImportResult(null);
      setImportDateRows([]);
      setEditingIssueKeys({});
      setSummaryMissingConsultants([]);
      setStep(1);
      setPendingImportTable(null);
      setConfirmedImportMeta(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al leer uno o más archivos. Intenta de nuevo.');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files?.length) addFiles(files);
    else toast.error('Arrastra uno o más archivos HTML o MHTML');
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.length) addFiles(files);
    e.target.value = '';
  };

  const removeUploadedFile = (index: number) => {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
    setTables([]);
    setImportResult(null);
    setImportDateRows([]);
    setEditingIssueKeys({});
    setSummaryMissingConsultants([]);
    setStep(1);
    setPendingImportTable(null);
    setConfirmedImportMeta(null);
  };

  const clearUploadedFiles = () => {
    setUploadedFiles([]);
    setTables([]);
    setImportResult(null);
    setImportDateRows([]);
    setEditingIssueKeys({});
    setSummaryMissingConsultants([]);
    setFileName('');
    setStep(1);
    setPendingImportTable(null);
    setConfirmedImportMeta(null);
  };

  const extractFromFiles = async (files: UploadedFile[]): Promise<TableData | null> => {
    if (files.length === 0) {
      toast.error('Sube al menos un archivo HTML y luego haz clic en Extraer');
      return null;
    }
    setIsExtracting(true);
    try {
      const allRows: string[][] = [];
      let combinedHeaders: string[] = [];

      for (const { content, name } of files) {
        const htmlContent = extractHtmlFromMhtml(content);
        let fileTables = parseHTMLTables(htmlContent);
        const isMhtml = /\.mht(ml)?$/i.test(name || '');
        if (isMhtml && fileTables.every((t) => !t.headers.length) && htmlContent !== content) {
          fileTables = parseHTMLTables(content);
        }
        for (const table of fileTables) {
          if (table.headers.length) {
            if (combinedHeaders.length === 0) combinedHeaders = table.headers;
            allRows.push(...table.rows);
          }
        }
      }

      if (combinedHeaders.length === 0) {
        setTables([]);
        toast.error('No se encontraron tablas válidas. Abre el reporte de comisiones en el navegador (o sube un HTML guardado) e intenta de nuevo.');
        return null;
      }

      const extracted: TableData = {
        headers: combinedHeaders,
        rows: allRows,
        metadata: undefined,
        sectionName: 'combined',
      };
      setFileName(files.map(f => f.name.replace(/\.[^/.]+$/, '')).join('_'));
      setTables([extracted]);
      setImportResult(null);
      return extracted;
    } catch (err) {
      console.error(err);
      toast.error('Error al extraer datos. Revisa que los archivos sean HTML válidos.');
      return null;
    } finally {
      setIsExtracting(false);
    }
  };

  const normalizeHeaderKey = (h?: string | null): string =>
    (h || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '');

  const headerIndexMap = (headers: string[]): Map<string, number> => {
    const map = new Map<string, number>();
    headers.forEach((h, idx) => {
      map.set(normalizeHeaderKey(h), idx);
    });
    return map;
  };

  const indexFromHeaders = (
    map: Map<string, number>,
    candidates: string[],
    fallback: number,
  ): number => {
    for (const name of candidates) {
      const idx = map.get(normalizeHeaderKey(name));
      if (idx !== undefined) return idx;
    }
    return fallback;
  };

  const checkMissingConsultants = async (
    rows: string[][],
    officeId: string,
    headers?: string[],
  ): Promise<{ missing: string[]; consultants: Array<{ code: string; name?: string }> }> => {
    const map = headerIndexMap(headers ?? []);
    const asesorIdx = indexFromHeaders(map, ['ASESOR'], 5);
    const nameIdx = indexFromHeaders(map, ['NOMBRE ASESOR', 'NOMBREASESOR'], 6);

    const byCode = new Map<string, { code: string; name?: string }>();
    rows.forEach((row) => {
      const code = row[asesorIdx]?.trim();
      if (!code) return;
      const key = code.toLowerCase();
      const name = row[nameIdx]?.trim() || undefined;
      const prev = byCode.get(key);
      if (!prev) {
        byCode.set(key, { code, name });
        return;
      }
      if (!prev.name && name) {
        byCode.set(key, { code: prev.code, name });
      }
    });

    const consultants = Array.from(byCode.values());
    if (consultants.length === 0) {
      return { missing: [], consultants: [] };
    }

    const codes = consultants.map((c) => c.code);
    const missing: string[] = [];
    for (const codeBatch of chunkArray(codes, IMPORT_BATCH_SIZE)) {
      const res = await authFetch('/api/extractor/missing-consultants', {
        method: 'POST',
        body: JSON.stringify({ officeId, codes: codeBatch }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron verificar los asesores.');
      }
      if (Array.isArray(data.missing)) {
        missing.push(...(data.missing as string[]));
      }
    }
    return { missing, consultants };
  };

  const checkDuplicates = async (
    rows: string[][],
    officeId: string,
    headers?: string[],
  ): Promise<{ contracts: string[]; details: Array<{ contract: string; ticket: string; row: number }> }> => {
    const map = headerIndexMap(headers ?? []);
    const contractNumberIndex = indexFromHeaders(map, ['POLIZA'], 1);
    const paymentDateIndex = indexFromHeaders(map, ['FECHA PAGO'], 11);
    const premiumPaymentIndex = indexFromHeaders(
      map,
      ['PRIMA PAGO', 'PRIMA PAGO 1'],
      14,
    );

    const parseDate = (dateStr: string | null): string | null => {
      if (!dateStr || !dateStr.trim()) return null;
      const trimmed = dateStr.trim();
      const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
      if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
      const parts = trimmed.split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
      return null;
    };

    const parseNumeric = (value: string | null): number | null => {
      if (!value || !value.trim() || value.trim() === 'NULL') return null;
      const cleaned = value.trim().replace(/,/g, '').replace(/\s/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    };

    const contractNumbers = [
      ...new Set(
        rows
          .map((row) => (row[contractNumberIndex] ?? "").trim().replace(/,/g, "").replace(/\s+/g, ""))
          .filter((p): p is string => Boolean(p)),
      ),
    ];

    const details: Array<{
      contractNumber: string;
      paymentDate: string | null;
      premiumPayment: number | null;
      row: number;
    }> = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const contractNumber = (row[contractNumberIndex] ?? "")
        .trim()
        .replace(/,/g, "")
        .replace(/\s+/g, "");
      if (!contractNumber) continue;
      const premium = parseNumeric(row[premiumPaymentIndex]?.trim() || null);
      details.push({
        contractNumber,
        paymentDate: parseDate(row[paymentDateIndex]?.trim() || null),
        premiumPayment:
          premium != null && Number.isFinite(premium) ? premium : null,
        row: i + 1,
      });
    }

    const contractSet = new Set<string>();
    const duplicateDetails: Array<{
      contract: string;
      ticket: string;
      row: number;
    }> = [];

    const mergeDuplicateResponse = (data: {
      contracts?: string[];
      details?: Array<{ contract: string; ticket: string; row: number }>;
    }) => {
      for (const c of data.contracts || []) {
        if (c) contractSet.add(c);
      }
      for (const d of data.details || []) {
        duplicateDetails.push(d);
      }
    };

    // Large Excel files exceed API caps — check batch by batch.
    if (details.length === 0) {
      for (const numberBatch of chunkArray(
        contractNumbers,
        IMPORT_BATCH_SIZE,
      )) {
        const res = await authFetch('/api/extractor/check-duplicates', {
          method: 'POST',
          body: JSON.stringify({ officeId, contractNumbers: numberBatch }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'No se pudieron verificar duplicados.');
        }
        mergeDuplicateResponse(data);
      }
    } else {
      for (const detailBatch of chunkArray(
        details,
        IMPORT_BATCH_SIZE,
      )) {
        const batchContractNumbers = [
          ...new Set(detailBatch.map((d) => d.contractNumber).filter(Boolean)),
        ];
        const res = await authFetch('/api/extractor/check-duplicates', {
          method: 'POST',
          body: JSON.stringify({
            officeId,
            contractNumbers: batchContractNumbers,
            details: detailBatch,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || 'No se pudieron verificar duplicados.');
        }
        mergeDuplicateResponse(data);
      }
    }

    return {
      contracts: [...contractSet],
      details: duplicateDetails,
    };
  };

  const handleImport = async (sourceTable?: TableData) => {
    const baseTable = sourceTable ?? tables[0];
    if (!baseTable || baseTable.rows.length === 0) {
      toast.error('No hay datos para importar. Revisa que el HTML tenga tablas válidas.');
      return;
    }

    if (!profile?.id) {
      toast.error('Debes iniciar sesión para importar datos.');
      return;
    }

    const officeId = profile.role === 'consultant' ? (profile.office_id || profile.id) : profile.id;
    if (!officeId) {
      toast.error('No se pudo determinar la promotoría. Contacta a soporte.');
      return;
    }

    if (profile.role === 'consultant' && !profile.consultant_code?.trim()) {
      toast.error('Tu perfil de asesor no tiene código. Contacta a tu promotoría.');
      return;
    }

    setIsCheckingDuplicates(true);
    setImportResult(null);
    setImportDateErrors({});

    try {
      const headers = baseTable.headers || [];
      const map = headerIndexMap(headers);
      const polizaIdx = map.get('POLIZA') ?? 1;
      const clienteIdx = map.get('CLIENTE') ?? 0;
      const issueIdx = map.get('FECHAEMISION') ?? 8;
      const asesorIdx = map.get('ASESOR') ?? 5;

      // Asesores only import rows for their own code
      let rowsForImport = baseTable.rows;
      let skippedOtherCodes = 0;
      if (profile.role === 'consultant' && profile.consultant_code) {
        const myCode = profile.consultant_code.trim().toLowerCase();
        const kept: string[][] = [];
        // Use baseTable (not React state) so Continuar works right after extract
        for (const row of baseTable.rows) {
          const code = (row[asesorIdx] ?? '').trim().toLowerCase();
          if (code && code === myCode) {
            kept.push(row);
          } else {
            skippedOtherCodes += 1;
          }
        }
        if (kept.length === 0) {
          setIsCheckingDuplicates(false);
          setImportResult({
            success: 0,
            errors: [{
              row: 0,
              error: `No hay filas con tu código de asesor (${profile.consultant_code}) en este archivo.`,
            }],
            warnings: skippedOtherCodes > 0
              ? [{
                row: 0,
                message: `Se omitieron ${skippedOtherCodes} fila(s) de otros asesores.`,
              }]
              : [],
          });
          return;
        }
        rowsForImport = kept;
        if (skippedOtherCodes > 0) {
          toast.success(
            `Solo se importarán tus pólizas. Se omitieron ${skippedOtherCodes} fila(s) de otros asesores.`,
          );
        }
      }

      const duplicateData = await checkDuplicates(
        rowsForImport,
        officeId,
        headers,
      );
      const existingSet = new Set(
        duplicateData.contracts.map((c) => c.trim().replace(/,/g, '').replace(/\s+/g, '')),
      );

      const dateRowMap = new Map<string, ImportDateRow>();

      rowsForImport.forEach((row, rowIndex) => {
        const rawNumber = (row[polizaIdx] ?? '').trim();
        const contractNumber = rawNumber.replace(/,/g, '').replace(/\s+/g, '');
        const clientName = (row[clienteIdx] ?? '').trim();
        const issueRaw = (row[issueIdx] ?? '').trim();
        const issueIso = parseFlexibleDateToIso(issueRaw);
        const consultantCode = (row[asesorIdx] ?? '').trim();
        // Already in the office DB: skip date capture (HTML often omits FECHA EMISION
        // on commission rows; we must not ask again for imported pólizas).
        const isNew = !contractNumber || !existingSet.has(contractNumber);
        if (!isNew) return;

        const key = contractNumber || `__unnamed__:${clientName.toLowerCase() || rowIndex}`;
        const existing = dateRowMap.get(key);
        if (existing) {
          existing.rowIndexes.push(rowIndex);
          if (!issueIso) existing.issueMissing = true;
          else if (!existing.issueDate) existing.issueDate = issueIso;
          if (!existing.consultantCode && consultantCode) {
            existing.consultantCode = consultantCode;
          }
          return;
        }
        dateRowMap.set(key, {
          key,
          contractNumber: contractNumber || '(sin número)',
          clientName: clientName || '—',
          consultantCode,
          rowIndexes: [rowIndex],
          issueDate: issueIso ?? '',
          issueMissing: !issueIso,
          needsPriorPayment: true,
          priorPaymentDate: '',
        });
      });

      // Persist scoped rows for the import dialog → continue flow
      if (rowsForImport !== baseTable.rows) {
        setTables([{ ...baseTable, rows: rowsForImport }, ...tables.slice(1)]);
      } else if (sourceTable) {
        setTables([baseTable, ...tables.slice(1)]);
      }

      const suggested = suggestFileIssueDateFromPaymentColumn(headers, rowsForImport);
      setDialogFileIssueDate(suggested);
      setImportDateRows([...dateRowMap.values()]);
      setEditingIssueKeys({});
      setSummaryMissingConsultants([]);
      setShowImportDatesDialog(false);
      setStep(2);
    } catch (error: unknown) {
      setImportResult({
        success: 0,
        errors: [{
          row: 0,
          error:
            error instanceof Error
              ? error.message
              : 'No se pudieron preparar las fechas de importación.',
        }],
        warnings: [],
      });
    } finally {
      setIsCheckingDuplicates(false);
    }
  };

  const handleConfirmImportDates = async () => {
    const officeId =
      profile?.role === 'consultant'
        ? profile.office_id || profile.id
        : profile?.id;
    if (!officeId || !profile?.id) return;

    const errors: Record<string, string> = {};
    const fileIso = dialogFileIssueDate.trim();
    const todayIso = todayIsoDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fileIso)) {
      errors.issueDate = 'Indica la fecha de emisión del archivo.';
    } else if (fileIso > todayIso) {
      errors.issueDate = 'No puede ser una fecha futura.';
    }

    for (const row of importDateRows) {
      const issue = row.issueDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) {
        errors[`issue:${row.key}`] = 'Obligatoria para importar.';
      } else if (issue > todayIso) {
        errors[`issue:${row.key}`] = 'No puede ser una fecha futura.';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fileIso) && issue >= fileIso) {
        errors[`issue:${row.key}`] =
          'Debe ser anterior a la fecha del archivo de comisiones.';
      }

      if (row.needsPriorPayment) {
        const prior = row.priorPaymentDate.trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(prior)) {
          errors[`prior:${row.key}`] = 'Obligatoria para pólizas nuevas.';
        } else if (prior > todayIso) {
          errors[`prior:${row.key}`] = 'No puede ser una fecha futura.';
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      setImportDateErrors(errors);
      return;
    }
    setImportDateErrors({});

    // Write FECHA EMISION (+ mes/año) into the editable table (sync for import)
    const headers = tables[0].headers || [];
    const map = headerIndexMap(headers);
    const issueIdx = map.get('FECHAEMISION') ?? 8;
    const mesIdx = map.get('MESEMISION') ?? 9;
    const anioIdx = map.get('ANOEMISION') ?? map.get('ANIOEMISION') ?? 10;
    const nextRows = tables[0].rows.map((r) => [...r]);
    for (const item of importDateRows) {
      const iso = item.issueDate.trim();
      const display = isoToDdMmYyyy(iso);
      const [, mm, yyyy] = iso.split('-');
      for (const rowIndex of item.rowIndexes) {
        const row = nextRows[rowIndex];
        if (!row) continue;
        row[issueIdx] = display;
        if (mesIdx < row.length) row[mesIdx] = mm || '';
        if (anioIdx < row.length) row[anioIdx] = yyyy || '';
      }
    }
    const tableForImport: TableData = { ...tables[0], rows: nextRows };
    setTables((prev) =>
      prev.length === 0 ? prev : [tableForImport, ...prev.slice(1)],
    );

    const priorPaymentByContract: Record<string, string> = {};
    for (const row of importDateRows) {
      if (row.needsPriorPayment) {
        priorPaymentByContract[row.key] = row.priorPaymentDate.trim();
      }
    }

    const meta = {
      fileIssueDate: fileIso,
      priorPaymentByContract,
    };
    setConfirmedImportMeta(meta);
    setPendingImportTable(tableForImport);
    setShowImportDatesDialog(false);
    setStep(3);

    // Preview missing asesores so step 3 can warn they will be created manually
    if (profile.role !== 'consultant') {
      setSummaryMissingLoading(true);
      void checkMissingConsultants(
        tableForImport.rows,
        officeId,
        tableForImport.headers,
      )
        .then(({ missing, consultants }) => {
          const missingSet = new Set(
            missing.map((c) => c.trim().toLowerCase()),
          );
          setSummaryMissingConsultants(
            consultants.filter((c) =>
              missingSet.has(c.code.trim().toLowerCase()),
            ),
          );
        })
        .catch(() => {
          setSummaryMissingConsultants([]);
        })
        .finally(() => {
          setSummaryMissingLoading(false);
        });
    } else {
      setSummaryMissingConsultants([]);
      setSummaryMissingLoading(false);
    }
  };

  const handleRunImportFromSummary = async () => {
    const officeId =
      profile?.role === 'consultant'
        ? profile.office_id || profile.id
        : profile?.id;
    if (!officeId || !confirmedImportMeta || !pendingImportTable) {
      toast.error('Falta confirmar las fechas de importación.');
      setStep(2);
      return;
    }
    await continueImportAfterDates(officeId, pendingImportTable, confirmedImportMeta);
  };

  const handleStepperContinue = async () => {
    if (continueLockRef.current) return;
    if (isExtracting || isImporting || isCheckingDuplicates) return;
    continueLockRef.current = true;
    try {
      if (step === 1) {
        if (uploadedFiles.length === 0) {
          toast.error('Sube al menos un archivo HTML para continuar.');
          return;
        }
        // Always re-extract from current files so Continuar advances in one click
        const extracted = await extractFromFiles(uploadedFiles);
        if (!extracted) return;
        await handleImport(extracted);
        return;
      }
      if (step === 2) {
        await handleConfirmImportDates();
        return;
      }
      if (step === 3) {
        await handleRunImportFromSummary();
      }
    } finally {
      continueLockRef.current = false;
    }
  };

  const STEPS = [
    { id: 1 as const, label: 'Archivos', icon: FileUp },
    { id: 2 as const, label: 'Importación', icon: CalendarDays },
    { id: 3 as const, label: 'Resumen', icon: ClipboardList },
  ];

  const continueImportAfterDates = async (
    officeId: string,
    table: TableData,
    meta: { fileIssueDate: string; priorPaymentByContract: Record<string, string> },
  ) => {
    setIsImporting(true);

    // Ensure asesores exist (promotoría only — asesores never create other codes)
    let missing: string[] = [];
    let consultants: Array<{ code: string; name?: string }> = [];
    if (profile?.role !== 'consultant') {
      try {
        const checked = await checkMissingConsultants(
          table.rows,
          officeId,
          table.headers,
        );
        missing = checked.missing;
        consultants = checked.consultants;
      } catch (error: unknown) {
        setIsImporting(false);
        setImportResult({
          success: 0,
          errors: [{
            row: 0,
            error: error instanceof Error ? error.message : 'No se pudieron verificar los asesores.',
          }],
          warnings: [],
        });
        return;
      }
    }

    const missingSet = new Set(missing.map((c) => c.trim().toLowerCase()));
    const missingEntries = consultants.filter((c) =>
      missingSet.has(c.code.trim().toLowerCase()),
    );

    if (missingEntries.length > 0) {
      // Manual mode: register/invite dialog (env flag).
      if (REQUIRE_MANUAL_CONSULTANT_CREDENTIALS) {
        setMissingConsultants(
          missingEntries.map((c) => ({
            consultantCode: c.code,
            name: c.name || c.code,
            email: '',
            selected: true,
          })),
        );
        setShowConsultantDialog(true);
        setIsImporting(false);
        return;
      }

      try {
        const failed: Array<{ code: string; error?: string }> = [];
        let createdCount = 0;
        for (const batch of chunkArray(missingEntries, IMPORT_BATCH_SIZE)) {
          const res = await authFetch('/api/extractor/create-consultants', {
            method: 'POST',
            body: JSON.stringify({
              mode: 'auto',
              officeId,
              consultants: batch.map((c) => ({
                code: c.code,
                name: c.name || '',
              })),
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(data.error || 'No se pudieron crear los asesores.');
          }
          if (Array.isArray(data.results)) {
            for (const r of data.results as Array<{
              code: string;
              created?: boolean;
              error?: string;
            }>) {
              if (r.error) failed.push(r);
              if (r.created) createdCount += 1;
            }
          }
        }
        if (failed.length > 0) {
          setImportResult({
            success: 0,
            errors: failed.map((r) => ({
              row: 0,
              error: `Asesor "${r.code}": ${r.error}`,
            })),
            warnings: [],
          });
          setIsImporting(false);
          return;
        }
        if (createdCount === 0) {
          createdCount = missingEntries.length;
        }
        if (createdCount > 0) {
          toast.success(
            `Se ${createdCount === 1 ? 'creó' : 'crearon'} ${createdCount} asesor${createdCount === 1 ? '' : 'es'} automáticamente.`,
          );
        }
      } catch (error: unknown) {
        console.error('Error auto-creating consultants:', error);
        const message =
          error instanceof Error
            ? error.message
            : 'No se pudieron crear los asesores faltantes.';
        setImportResult({
          success: 0,
          errors: [{ row: 0, error: message }],
          warnings: [],
        });
        setIsImporting(false);
        return;
      }
    }

    // Check for duplicates
    setIsCheckingDuplicates(true);
    try {
      const duplicateData = await checkDuplicates(
        table.rows,
        officeId,
        table.headers,
      );

      setIsCheckingDuplicates(false);

      if (duplicateData.details.length > 0) {
        setDuplicates(duplicateData);
        setShowDuplicateDialog(true);
        setIsImporting(false);
        return;
      }

      await performImport(officeId, table, meta);
    } catch (error: any) {
      setIsCheckingDuplicates(false);
      setIsImporting(false);
      setImportResult({
        success: 0,
        errors: [{ row: 0, error: error.message || 'Error al verificar duplicados' }],
        warnings: []
      });
    }
  };

  const handleConfirmImport = async () => {
    setShowDuplicateDialog(false);
    const officeId = profile?.role === 'consultant' ? (profile.office_id || profile.id) : profile?.id;
    if (officeId && confirmedImportMeta) {
      await performImport(officeId, tables[0], confirmedImportMeta);
    }
  };

  const continueAfterMissingConsultants = async () => {
    setShowConsultantDialog(false);
    setMissingConsultants([]);

    const officeId =
      profile?.role === 'consultant'
        ? profile.office_id || profile.id
        : profile?.id;
    if (!officeId || !tables[0] || !confirmedImportMeta) return;

    setIsCheckingDuplicates(true);
    try {
      const duplicateData = await checkDuplicates(
        tables[0].rows,
        officeId,
        tables[0].headers,
      );

      setIsCheckingDuplicates(false);

      if (duplicateData.details.length > 0) {
        setDuplicates(duplicateData);
        setShowDuplicateDialog(true);
        return;
      }

      await performImport(officeId, tables[0], confirmedImportMeta);
    } catch (error: unknown) {
      setIsCheckingDuplicates(false);
      setImportResult({
        success: 0,
        errors: [
          {
            row: 0,
            error:
              error instanceof Error
                ? error.message
                : 'Error al verificar duplicados',
          },
        ],
        warnings: [],
      });
    }
  };

  const goToContractsAfterImport = () => {
    setShowImportOutcomeDialog(false);
    router.push('/dashboard/contracts');
  };

  const performImport = async (
    officeId: string,
    table: TableData,
    meta: { fileIssueDate: string; priorPaymentByContract: Record<string, string> },
  ) => {
    setIsImporting(true);
    setShowImportOutcomeDialog(false);
    setImportResult(null);
    setImportProgress({
      phase: 'grouping',
      current: 0,
      total: 1,
      percent: 0,
      etaSeconds: null,
      message: 'Preparando importación…',
    });

    try {
      let result;
      const onProgress = (progress: ImportProgress) => {
        setImportProgress(progress);
      };
      const importMeta = {
        fileIssueDate: meta.fileIssueDate.trim(),
        priorPaymentByContract: meta.priorPaymentByContract,
        fileName: fileName || uploadedFiles[0]?.name || null,
        requirePriorForNew: true,
      };
      if (profile?.role === 'consultant') {
        result = await db.contract.importContractsFromTable(
          table.rows,
          officeId,
          profile.id,
          table.headers,
          onProgress,
          importMeta,
        );
      } else {
        result = await db.contract.importContractsFromTable(
          table.rows,
          officeId,
          undefined,
          table.headers,
          onProgress,
          importMeta,
        );
      }
      setImportResult(result);
    } catch (error: unknown) {
      console.error('Import error:', error);
      setImportResult({
        success: 0,
        errors: [
          {
            row: 0,
            error:
              error instanceof Error
                ? error.message
                : 'Error desconocido durante la importación',
          },
        ],
        warnings: [],
      });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
      setShowImportOutcomeDialog(true);
    }
  };

  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const canContinueImportDates =
    isIsoDate(dialogFileIssueDate) &&
    importDateRows.every(
      (row) =>
        isIsoDate(row.issueDate) &&
        (!row.needsPriorPayment || isIsoDate(row.priorPaymentDate)),
    );

  const priorNeeded = importDateRows.filter((row) => row.needsPriorPayment).length;
  const dateTasksTotal = 1 + importDateRows.length + priorNeeded;
  const dateTasksReady =
    (isIsoDate(dialogFileIssueDate) ? 1 : 0) +
    importDateRows.filter((row) => isIsoDate(row.issueDate)).length +
    importDateRows.filter(
      (row) => row.needsPriorPayment && isIsoDate(row.priorPaymentDate),
    ).length;
  const dateProgressPct =
    dateTasksTotal > 0
      ? Math.round((dateTasksReady / dateTasksTotal) * 100)
      : 0;

  const nothingToImport =
    importDateRows.length === 0 &&
    !summaryMissingLoading &&
    summaryMissingConsultants.length === 0;

  const summaryMissingCount = summaryMissingConsultants.length;
  const showMissingConsultantsAlert =
    profile?.role !== 'consultant' &&
    !summaryMissingLoading &&
    summaryMissingCount > 0;
  const missingConsultantsTip =
    'Al importar tendrás que registrar estos asesores. Los códigos resaltados en la tabla son los que faltan.';

  const importOutcomeOk =
    Boolean(importResult) && (importResult?.errors.length ?? 0) === 0;
  const importOutcomeTitle = !importResult
    ? 'Importación'
    : importOutcomeOk
      ? 'Importación lista'
      : importResult.success > 0
        ? 'Importación parcial'
        : 'No se pudo importar';
  const importOutcomeDescription = (() => {
    if (!importResult) return 'La importación terminó.';
    const parts: string[] = [];
    if (importOutcomeOk) {
      parts.push(
        importResult.success === 1
          ? 'Se importó 1 póliza correctamente.'
          : `Se importaron ${importResult.success} pólizas correctamente.`,
      );
    } else if (importResult.success > 0) {
      parts.push(
        `Se importaron ${importResult.success} póliza(s), pero hubo ${importResult.errors.length} error(es).`,
      );
    } else {
      parts.push(
        importResult.errors[0]?.error ||
          'No se pudo completar la importación.',
      );
    }
    if (importResult.warnings.length > 0) {
      parts.push(
        `${importResult.warnings.length} aviso(s): algunas filas ya existían y se omitieron.`,
      );
    }
    if (!importOutcomeOk && importResult.errors.length > 1) {
      const extra = importResult.errors
        .slice(0, 3)
        .map((e) => (e.row > 0 ? `Fila ${e.row}: ${e.error}` : e.error))
        .join('\n');
      parts.push(extra);
    }
    return parts.join('\n\n');
  })();

  const continueDisabled =
    isExtracting ||
    isImporting ||
    isCheckingDuplicates ||
    (step === 1 && uploadedFiles.length === 0) ||
    (step === 2 && !canContinueImportDates);

  const showPrimaryAction = !(step === 3 && nothingToImport);

  const stepSurface =
    'mb-24 space-y-6 rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) p-5 sm:p-6';

  const bottomNavBtnClass = 'min-w-[10.5rem] justify-center';

  const focusDateInput = (inputId: string) => {
    const el = document.getElementById(inputId);
    if (el instanceof HTMLInputElement) {
      el.focus();
      el.select();
    }
  };

  /** Ordered date fields for Tab/Enter navigation on step 2. */
  const getImportDateFieldIds = (): string[] => {
    const ids = ['import-file-issue-date'];
    importDateRows.forEach((row, index) => {
      ids.push(`issue-date-${index}`);
      if (row.needsPriorPayment) ids.push(`prior-payment-${index}`);
    });
    return ids;
  };

  const isImportDateFieldComplete = (fieldId: string): boolean => {
    if (fieldId === 'import-file-issue-date') {
      return isIsoDate(dialogFileIssueDate);
    }
    const issueMatch = fieldId.match(/^issue-date-(\d+)$/);
    if (issueMatch) {
      const row = importDateRows[Number(issueMatch[1])];
      return Boolean(row && isIsoDate(row.issueDate));
    }
    const priorMatch = fieldId.match(/^prior-payment-(\d+)$/);
    if (priorMatch) {
      const row = importDateRows[Number(priorMatch[1])];
      return Boolean(row && isIsoDate(row.priorPaymentDate));
    }
    return false;
  };

  const focusImportDateField = (fieldId: string) => {
    const issueMatch = fieldId.match(/^issue-date-(\d+)$/);
    if (issueMatch) {
      const row = importDateRows[Number(issueMatch[1])];
      if (row && !row.issueMissing && !editingIssueKeys[row.key]) {
        setEditingIssueKeys((prev) => ({ ...prev, [row.key]: true }));
        window.setTimeout(() => focusDateInput(fieldId), 0);
        return;
      }
    }
    window.setTimeout(() => focusDateInput(fieldId), 0);
  };

  const advanceImportDateField = (currentId: string, direction: 'next' | 'prev') => {
    const seq = getImportDateFieldIds();
    const i = seq.indexOf(currentId);
    if (i < 0) return;

    if (direction === 'next') {
      for (let j = i + 1; j < seq.length; j += 1) {
        const candidate = seq[j];
        // Prefer empty fields; if everything ahead is filled, stop.
        if (!isImportDateFieldComplete(candidate)) {
          focusImportDateField(candidate);
          return;
        }
      }
      return;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      focusImportDateField(seq[j]);
      return;
    }
  };

  return (
    <div className="pb-4">
      <PageHeader
        title="Importar datos"
        watermark="Importar"
        description={
          profile?.role === 'consultant'
            ? 'Carga tus archivos HTML de comisiones. Solo se importarán las pólizas con tu código de asesor.'
            : 'Carga los archivos HTML de comisiones extraídos del portal. Luego importa pólizas, asesores, clientes y detalles.'
        }
      />

      <nav aria-label="Pasos de importación" className="mb-6 grid grid-cols-3 gap-2">
        {STEPS.map((s) => {
          const active = step === s.id;
          const done = step > s.id;
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => {
                if (s.id < step) setStep(s.id);
              }}
              disabled={s.id > step}
              className={cn(
                'flex flex-col items-center justify-center gap-1.5 rounded-lg border px-2 py-3 text-center transition-colors sm:px-3',
                active
                  ? 'border-[#FBDBAC] bg-[#FBDBAC]/15 text-(--lifeops-fg)'
                  : done
                    ? 'cursor-pointer border-(--lifeops-border) bg-(--lifeops-hover) text-(--lifeops-fg)'
                    : 'cursor-default border-(--lifeops-border) text-(--lifeops-muted) opacity-70',
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  active || done ? 'text-(--lifeops-accent)' : 'text-(--lifeops-muted)',
                )}
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="text-xs font-semibold sm:text-sm">{s.label}</span>
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <div className={stepSurface}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                <Upload className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-(--lifeops-fg)">
                  Sube el reporte HTML
                </h2>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  Arrastra o selecciona uno o más archivos del portal de comisiones.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowInfoDialog(true)}
              className="inline-flex cursor-pointer items-center gap-1.5 self-start text-sm font-medium text-(--lifeops-accent) hover:underline"
            >
              <HelpCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              ¿Cómo obtener el HTML?
            </button>
          </div>

          <div
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer rounded-lg border-2 border-dashed px-6 py-12 text-center transition-colors',
              isDragging
                ? 'border-[#FBDBAC] bg-[#FBDBAC]/10'
                : 'border-(--lifeops-border) bg-(--lifeops-page) hover:border-[#FBDBAC]/60',
            )}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.mhtml,.mht"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
            <FileUp
              className="mx-auto h-12 w-12 text-(--lifeops-muted)"
              strokeWidth={1.5}
              aria-hidden
            />
            <p className="mt-4 text-base font-medium text-(--lifeops-fg) sm:text-lg">
              Arrastra archivos HTML aquí, o haz clic para elegirlos
            </p>
            <p className="mt-2 text-sm text-(--lifeops-muted)">
              .html, .htm, .mhtml y .mht — puedes subir varios a la vez
            </p>
          </div>

          {uploadedFiles.length > 0 && (
            <div className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-(--lifeops-fg)">
                  Archivos listos ({uploadedFiles.length})
                </p>
                <button
                  type="button"
                  onClick={clearUploadedFiles}
                  className="cursor-pointer text-sm text-(--lifeops-muted) hover:text-red-500"
                >
                  Limpiar todo
                </button>
              </div>
              <ul className="flex flex-wrap gap-2">
                {uploadedFiles.map((f, i) => (
                  <li
                    key={`file-${i}-${f.name}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-(--lifeops-border) bg-(--lifeops-chrome) px-2.5 py-1.5 text-sm text-(--lifeops-fg)"
                  >
                    <FileText className="h-4 w-4 shrink-0 text-(--lifeops-accent)" aria-hidden />
                    <span className="truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeUploadedFile(i);
                      }}
                      className="rounded p-0.5 text-(--lifeops-muted) hover:bg-(--lifeops-hover) hover:text-red-500"
                      aria-label={`Quitar ${f.name}`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className={stepSurface}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                <CalendarDays className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-(--lifeops-fg)">
                  Confirma las fechas
                </h2>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  Completa los datos faltantes.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadAllCSV}
              disabled={tables.length === 0}
              className="shrink-0 gap-1.5 self-start"
            >
              <Download className="h-4 w-4" aria-hidden />
              Descargar CSV
            </Button>
          </div>

          <section className="flex flex-col gap-3 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                <FileText className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-base font-semibold text-(--lifeops-fg)">
                  Fecha del archivo
                  {isIsoDate(dialogFileIssueDate) ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Lista" />
                  ) : null}
                </p>
                <p className="mt-0.5 text-sm text-(--lifeops-muted)">
                  Emisión del reporte (sugerida desde FECHA PAGO)
                </p>
              </div>
            </div>
            <div className="w-full shrink-0 sm:w-auto sm:min-w-[12rem]">
              <DateInput
                id="import-file-issue-date"
                value={dialogFileIssueDate}
                max={todayIsoDate()}
                aria-label="Fecha del archivo de comisiones"
                aria-invalid={Boolean(importDateErrors.issueDate)}
                onAdvance={(dir) =>
                  advanceImportDateField('import-file-issue-date', dir)
                }
                onChange={(iso) => {
                  setDialogFileIssueDate(iso);
                  setImportDateErrors((prev) => {
                    const next = { ...prev };
                    delete next.issueDate;
                    return next;
                  });
                }}
                required
              />
              {importDateErrors.issueDate ? (
                <p className="mt-1 text-xs text-red-500" role="alert">
                  {importDateErrors.issueDate}
                </p>
              ) : null}
            </div>
          </section>

          {importDateRows.length === 0 ? (
            <div className="flex gap-3 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-(--lifeops-fg)">
                  No hace falta nada más por póliza
                </p>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  Todas ya tienen fecha de emisión y ninguna es nueva. Continúa cuando la
                  fecha del archivo esté bien.
                </p>
              </div>
            </div>
          ) : (
            <section className="overflow-hidden rounded-lg border border-(--lifeops-border) bg-(--lifeops-page)">
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                  <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-(--lifeops-fg)">
                    Fechas por póliza
                    <span className="ml-2 text-sm font-normal text-(--lifeops-muted)">
                      ({importDateRows.filter((r) => isIsoDate(r.issueDate)).length +
                        importDateRows.filter(
                          (r) => r.needsPriorPayment && isIsoDate(r.priorPaymentDate),
                        ).length}
                      /
                      {importDateRows.length + priorNeeded})
                    </span>
                  </p>
                  <p className="mt-0.5 text-sm text-(--lifeops-muted)">
                    Emisión faltante se captura aquí. Si ya viene en el archivo, clic para
                    corregirla. Último pago solo en pólizas nuevas.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto border-t border-(--lifeops-border)">
                <table className="min-w-full divide-y divide-(--lifeops-border)">
                  <thead className="bg-(--lifeops-hover)">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Póliza
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Cliente
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Fecha de emisión
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Último pago
                      </th>
                      <th className="w-10 px-3 py-2.5">
                        <span className="sr-only">Estado</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--lifeops-border)">
                    {importDateRows.map((row, index) => {
                      const todayIso = todayIsoDate();
                      const dayBeforeFile = dayBeforeIso(dialogFileIssueDate.trim());
                      const issueMax = dayBeforeFile
                        ? minIsoDate(todayIso, dayBeforeFile)
                        : todayIso;
                      const issueInputId = `issue-date-${index}`;
                      const priorInputId = `prior-payment-${index}`;
                      const showIssueInput =
                        row.issueMissing || Boolean(editingIssueKeys[row.key]);
                      const rowComplete =
                        isIsoDate(row.issueDate) &&
                        (!row.needsPriorPayment || isIsoDate(row.priorPaymentDate));
                      return (
                        <tr
                          key={row.key}
                          className={cn(
                            'cursor-pointer transition-colors',
                            rowComplete
                              ? 'bg-emerald-500/10 hover:bg-emerald-500/15'
                              : 'hover:bg-(--lifeops-hover)/50',
                          )}
                          onClick={() => {
                            if (showIssueInput) focusDateInput(issueInputId);
                            else if (row.needsPriorPayment) focusDateInput(priorInputId);
                          }}
                        >
                          <td className="whitespace-nowrap px-3 py-2 text-sm font-medium text-(--lifeops-fg)">
                            {row.contractNumber}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2 text-sm text-(--lifeops-muted) sm:max-w-none">
                            {row.clientName}
                          </td>
                          <td
                            className="px-3 py-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!showIssueInput) {
                                setEditingIssueKeys((prev) => ({
                                  ...prev,
                                  [row.key]: true,
                                }));
                                window.setTimeout(() => focusDateInput(issueInputId), 0);
                              }
                            }}
                          >
                            {showIssueInput ? (
                              <>
                                <DateInput
                                  id={issueInputId}
                                  value={row.issueDate}
                                  max={issueMax}
                                  aria-label={`Fecha de emisión de ${row.contractNumber}`}
                                  aria-invalid={Boolean(importDateErrors[`issue:${row.key}`])}
                                  onAdvance={(dir) =>
                                    advanceImportDateField(issueInputId, dir)
                                  }
                                  onChange={(iso) => {
                                    setImportDateRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key ? { ...r, issueDate: iso } : r,
                                      ),
                                    );
                                    setImportDateErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[`issue:${row.key}`];
                                      return next;
                                    });
                                  }}
                                  required
                                />
                                {importDateErrors[`issue:${row.key}`] ? (
                                  <p className="mt-1 text-xs text-red-500" role="alert">
                                    {importDateErrors[`issue:${row.key}`]}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <button
                                type="button"
                                className="rounded-md px-1 py-1 text-left font-mono text-sm text-(--lifeops-fg) underline-offset-2 hover:bg-(--lifeops-hover) hover:underline"
                                title="Clic para editar"
                              >
                                {isoToDdMmYyyy(row.issueDate)}
                              </button>
                            )}
                          </td>
                          <td
                            className="px-3 py-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.needsPriorPayment ? (
                              <>
                                <DateInput
                                  id={priorInputId}
                                  value={row.priorPaymentDate}
                                  max={todayIso}
                                  aria-label={`Último pago de ${row.contractNumber}`}
                                  aria-invalid={Boolean(importDateErrors[`prior:${row.key}`])}
                                  onAdvance={(dir) =>
                                    advanceImportDateField(priorInputId, dir)
                                  }
                                  onChange={(iso) => {
                                    setImportDateRows((prev) =>
                                      prev.map((r) =>
                                        r.key === row.key
                                          ? { ...r, priorPaymentDate: iso }
                                          : r,
                                      ),
                                    );
                                    setImportDateErrors((prev) => {
                                      const next = { ...prev };
                                      delete next[`prior:${row.key}`];
                                      return next;
                                    });
                                  }}
                                  required
                                />
                                {importDateErrors[`prior:${row.key}`] ? (
                                  <p className="mt-1 text-xs text-red-500" role="alert">
                                    {importDateErrors[`prior:${row.key}`]}
                                  </p>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-sm text-(--lifeops-muted)">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {rowComplete ? (
                              <CheckCircle2
                                className="inline-block h-5 w-5 text-emerald-500"
                                strokeWidth={1.75}
                                aria-label="Fila completa"
                              />
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {step === 3 && tables.length === 0 && (
        <div className={stepSurface}>
          <p className="text-(--lifeops-muted)">
            No hay datos para resumir. Vuelve al paso 1 y sube un archivo válido.
          </p>
        </div>
      )}
      {step === 3 && tables.length > 0 && (
        <div className={stepSurface}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                <ClipboardList className="h-5 w-5" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-(--lifeops-fg)">
                  Revisa e importa
                </h2>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  Mismo resumen que en fechas, más el código de asesor. Confirma y luego
                  importa a la base.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={downloadAllCSV}
              className="shrink-0 gap-1.5 self-start"
            >
              <Download className="h-4 w-4" aria-hidden />
              Descargar CSV
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
              <p className="text-xs uppercase tracking-wide text-(--lifeops-muted)">
                Pólizas nuevas
              </p>
              <p className="mt-1 text-2xl font-semibold text-(--lifeops-fg)">
                {importDateRows.length}
              </p>
            </div>
            <div
              className={cn(
                'group relative rounded-lg border p-4',
                showMissingConsultantsAlert
                  ? 'cursor-help border-[#FBDBAC]/60 bg-[#FBDBAC]/15 ring-1 ring-[#FBDBAC]/35'
                  : 'border-(--lifeops-border) bg-(--lifeops-page)',
              )}
              title={showMissingConsultantsAlert ? missingConsultantsTip : undefined}
              tabIndex={showMissingConsultantsAlert ? 0 : undefined}
              aria-label={
                showMissingConsultantsAlert
                  ? `${summaryMissingCount} asesores por crear. ${missingConsultantsTip}`
                  : undefined
              }
            >
              <p
                className={cn(
                  'text-xs uppercase tracking-wide',
                  showMissingConsultantsAlert
                    ? 'font-semibold text-(--lifeops-accent)'
                    : 'text-(--lifeops-muted)',
                )}
              >
                Asesores por crear
              </p>
              <p
                className={cn(
                  'mt-1 text-2xl font-semibold',
                  showMissingConsultantsAlert
                    ? 'text-(--lifeops-accent)'
                    : 'text-(--lifeops-fg)',
                )}
              >
                {summaryMissingLoading ? '…' : summaryMissingCount}
              </p>
              {showMissingConsultantsAlert ? (
                <span
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 rounded-md border border-(--lifeops-border) bg-(--lifeops-chrome) px-2.5 py-1.5 text-center text-xs font-medium text-(--lifeops-fg) opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                >
                  {missingConsultantsTip}
                </span>
              ) : null}
            </div>
          </div>

          {importResult && (
            <>
              {importResult.warnings && importResult.warnings.length > 0 && (
                <div className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
                  <h3 className="mb-2 text-sm font-semibold text-(--lifeops-fg)">
                    Advertencias ({importResult.warnings.length})
                  </h3>
                  <p className="mb-2 text-xs text-(--lifeops-muted)">
                    Se omitieron porque ya existen en la base:
                  </p>
                  <div className="max-h-60 overflow-y-auto text-sm text-(--lifeops-muted)">
                    <ul className="list-inside list-disc space-y-1">
                      {importResult.warnings.slice(0, 50).map((warning, idx) => (
                        <li key={`warn-${idx}-${warning.row}`}>
                          {warning.row > 0 ? `Fila ${warning.row}: ` : ''}
                          {warning.message}
                        </li>
                      ))}
                      {importResult.warnings.length > 50 && (
                        <li key="warn-more">
                          … y {importResult.warnings.length - 50} más
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              <div
                className={cn(
                  'rounded-lg border p-4',
                  importResult.errors.length === 0
                    ? 'border-emerald-500/40 bg-emerald-500/10'
                    : 'border-amber-500/40 bg-amber-500/10',
                )}
              >
                <h3 className="mb-2 text-sm font-semibold text-(--lifeops-fg)">
                  {importResult.errors.length === 0
                    ? `Se importaron ${importResult.success} póliza(s)`
                    : `Importación: ${importResult.success} ok, ${importResult.errors.length} error(es)`}
                </h3>
                {importResult.errors.length > 0 && (
                  <div className="max-h-60 overflow-y-auto text-sm text-(--lifeops-muted)">
                    <ul className="list-inside list-disc space-y-1">
                      {importResult.errors.slice(0, 50).map((error, idx) => (
                        <li key={`err-${idx}-${error.row}`}>
                          {error.row > 0 ? `Fila ${error.row}: ` : ''}
                          {error.error}
                        </li>
                      ))}
                      {importResult.errors.length > 50 && (
                        <li key="err-more">
                          … y {importResult.errors.length - 50} más
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {nothingToImport ? (
            <div className="flex gap-3 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-(--lifeops-fg)">
                  No hay nada nuevo que importar
                </p>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  No hay pólizas ni asesores nuevos en este archivo
                  {isIsoDate(dialogFileIssueDate)
                    ? ` (fecha del archivo: ${isoToDdMmYyyy(dialogFileIssueDate)})`
                    : ''}
                  . Puedes volver o descargar el CSV si lo necesitas.
                </p>
              </div>
            </div>
          ) : importDateRows.length === 0 ? (
            <div className="flex gap-3 rounded-lg border border-(--lifeops-border) bg-(--lifeops-page) p-4">
              <CheckCircle2
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
                strokeWidth={1.75}
                aria-hidden
              />
              <div>
                <p className="text-sm font-medium text-(--lifeops-fg)">
                  Sin pólizas nuevas; hay asesores por crear
                </p>
                <p className="mt-1 text-sm text-(--lifeops-muted)">
                  No hay pólizas nuevas, pero al importar se registrarán los asesores
                  faltantes
                  {isIsoDate(dialogFileIssueDate)
                    ? ` · fecha del archivo: ${isoToDdMmYyyy(dialogFileIssueDate)}`
                    : ''}
                  .
                </p>
              </div>
            </div>
          ) : (
            <section className="overflow-hidden rounded-lg border border-(--lifeops-border) bg-(--lifeops-page)">
              <div className="flex items-start gap-3 px-4 py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                  <CalendarDays className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="text-base font-semibold text-(--lifeops-fg)">
                    Pólizas a registrar
                  </p>
                  <p className="mt-0.5 text-sm text-(--lifeops-muted)">
                    Fechas confirmadas y código de asesor. Si el asesor aparece arriba como
                    nuevo, se creará de forma manual al importar.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto border-t border-(--lifeops-border)">
                <table className="min-w-full divide-y divide-(--lifeops-border)">
                  <thead className="bg-(--lifeops-hover)">
                    <tr>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Póliza
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Cliente
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Asesor
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Fecha de emisión
                      </th>
                      <th className="px-3 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-(--lifeops-muted)">
                        Último pago
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-(--lifeops-border)">
                    {importDateRows.map((row) => {
                      const codeKey = row.consultantCode.trim().toLowerCase();
                      const isMissingAsesor =
                        Boolean(codeKey) &&
                        summaryMissingConsultants.some(
                          (c) => c.code.trim().toLowerCase() === codeKey,
                        );
                      return (
                        <tr
                          key={row.key}
                          className="hover:bg-(--lifeops-hover)/50"
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 text-sm font-medium text-(--lifeops-fg)">
                            {row.contractNumber}
                          </td>
                          <td className="max-w-[12rem] truncate px-3 py-2.5 text-sm text-(--lifeops-muted) sm:max-w-none">
                            {row.clientName}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-sm">
                            {row.consultantCode ? (
                              isMissingAsesor ? (
                                <span className="group relative inline-flex">
                                  <span
                                    className="cursor-help rounded-md bg-[#FBDBAC]/20 px-1.5 py-0.5 font-mono font-medium text-(--lifeops-accent) ring-1 ring-[#FBDBAC]/50"
                                    title="Asesor no registrado"
                                    tabIndex={0}
                                    aria-label={`${row.consultantCode}: asesor no registrado`}
                                  >
                                    {row.consultantCode}
                                  </span>
                                  <span
                                    role="tooltip"
                                    className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md border border-(--lifeops-border) bg-(--lifeops-chrome) px-2 py-1 text-xs font-medium text-(--lifeops-fg) opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                  >
                                    Asesor no registrado
                                  </span>
                                </span>
                              ) : (
                                <span className="font-mono text-(--lifeops-fg)">
                                  {row.consultantCode}
                                </span>
                              )
                            ) : (
                              <span className="text-(--lifeops-muted)">—</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-sm text-(--lifeops-fg)">
                            {isIsoDate(row.issueDate)
                              ? isoToDdMmYyyy(row.issueDate)
                              : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 font-mono text-sm text-(--lifeops-fg)">
                            {row.needsPriorPayment && isIsoDate(row.priorPaymentDate)
                              ? isoToDdMmYyyy(row.priorPaymentDate)
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-(--lifeops-border) bg-(--lifeops-chrome)/95 backdrop-blur-sm lg:left-[260px]">
        {step === 2 ? (
          <div className="mx-auto max-w-7xl px-4 pt-2.5 sm:px-6 lg:px-8">
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs text-(--lifeops-muted)">
              <span>Fechas listas</span>
              <span className="tabular-nums text-(--lifeops-fg)">
                {dateTasksReady}/{dateTasksTotal}
                <span className="ml-1.5 text-(--lifeops-muted)">
                  ({dateProgressPct}%)
                </span>
              </span>
            </div>
            <div
              className="h-1.5 overflow-hidden rounded-full bg-(--lifeops-hover)"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={dateTasksTotal}
              aria-valuenow={dateTasksReady}
              aria-label="Progreso de fechas por completar"
            >
              <div
                className="h-full rounded-full bg-[#FBDBAC] transition-[width] duration-300 ease-out"
                style={{ width: `${dateProgressPct}%` }}
              />
            </div>
          </div>
        ) : null}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
          {step > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="lg"
              className={bottomNavBtnClass}
              disabled={isExtracting || isImporting || isCheckingDuplicates}
              onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
            >
              Atrás
            </Button>
          ) : (
            <span className={bottomNavBtnClass} aria-hidden />
          )}
          <p className="hidden text-sm text-(--lifeops-muted) sm:block">
            Paso {step} de 3
          </p>
          {showPrimaryAction ? (
            <Button
              type="button"
              variant="brand"
              size="lg"
              disabled={continueDisabled}
              className={cn(bottomNavBtnClass, !continueDisabled && 'lifeops-cta-pulse')}
              onClick={() => void handleStepperContinue()}
            >
              {isExtracting
                ? 'Procesando…'
                : isCheckingDuplicates
                  ? 'Preparando…'
                  : isImporting
                    ? 'Importando…'
                    : step === 3
                      ? 'Importar'
                      : 'Continuar'}
            </Button>
          ) : (
            <span className={bottomNavBtnClass} aria-hidden />
          )}
        </div>
      </div>

      {/* Loading Overlay */}
      {(isExtracting || isCheckingDuplicates || isImporting) && (
        <div
          className={cn(
            'fixed flex items-center justify-center bg-black/50',
            isImporting
              ? 'bottom-0 left-0 right-0 top-20 z-40 sm:top-24 lg:top-0'
              : 'inset-0 z-50',
          )}
        >
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {isExtracting
                  ? 'Extrayendo datos'
                  : isCheckingDuplicates
                    ? 'Verificando Duplicados'
                    : 'Importando Datos'}
              </h3>
              {isImporting && importProgress ? (
                <div className="space-y-3 text-left">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {importProgress.message}
                  </p>
                  <div
                    className="h-2.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden"
                    role="progressbar"
                    aria-valuenow={importProgress.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Progreso de importación"
                  >
                    <div
                      className="h-full rounded-full bg-blue-600 transition-[width] duration-300 ease-out"
                      style={{ width: `${importProgress.percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                    <span>{importProgress.percent}%</span>
                    <span>
                      {importProgress.total > 0
                        ? `${importProgress.current} / ${importProgress.total}`
                        : null}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Tiempo restante: {formatEtaSeconds(importProgress.etaSeconds)}
                  </p>
                </div>
              ) : (
                <p className="text-gray-600 dark:text-gray-400">
                  {isExtracting
                    ? 'Procesando archivos y ordenando por cliente...'
                    : isCheckingDuplicates
                      ? 'Por favor espera mientras verificamos la base de datos por registros existentes...'
                      : 'Por favor espera mientras importamos tus datos...'}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Confirmation Dialog */}
      {showDuplicateDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                ⚠️ Duplicados Encontrados
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Los siguientes números de ticket ya existen en la base de datos. Los registros duplicados se omitirán durante la importación.
              </p>

              {duplicates.details.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Números de Ticket Duplicados ({duplicates.details.length})
                  </h3>
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4 max-h-40 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                      {duplicates.details.map((detail, idx) => (
                        <li key={`dup-${idx}-${detail.row}-${detail.ticket}`}>
                          Fila {detail.row}: Contrato &quot;{detail.contract}&quot; - Ticket &quot;{detail.ticket}&quot;
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4 pt-4">
                <button
                  onClick={() => {
                    setShowDuplicateDialog(false);
                    setDuplicates({ contracts: [], details: [] });
                  }}
                  className="px-6 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmImport}
                  className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                >
                  Continuar con la Importación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <MissingConsultantsDialog
        open={showConsultantDialog}
        officeId={
          (profile?.role === 'consultant'
            ? profile.office_id || profile.id
            : profile?.id) || ''
        }
        consultants={missingConsultants}
        onChange={setMissingConsultants}
        onClose={() => {
          setShowConsultantDialog(false);
          setMissingConsultants([]);
        }}
        onDone={continueAfterMissingConsultants}
        busy={isCheckingDuplicates || isImporting}
      />

      <AppDialog
        open={showImportOutcomeDialog && !isImporting}
        title={importOutcomeTitle}
        description={
          importOutcomeOk
            ? 'Ya puedes revisar las pólizas en el listado.'
            : 'Revisa el detalle y continúa en pólizas.'
        }
        onClose={goToContractsAfterImport}
        size="md"
      >
        <p className="whitespace-pre-line text-sm text-(--lifeops-muted)">
          {importOutcomeDescription}
        </p>
        <div className="flex justify-end pt-1">
          <Button
            type="button"
            variant="brand"
            size="lg"
            onClick={goToContractsAfterImport}
          >
            Ir a pólizas
          </Button>
        </div>
      </AppDialog>

      {/* Info Dialog */}
      {showInfoDialog && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowInfoDialog(false)} onKeyDown={(e) => { if (e.key === 'Escape') setShowInfoDialog(false); }}>
          <div role="document" className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                ¿Cómo obtener el archivo HTML?
              </h2>
              <button
                onClick={() => setShowInfoDialog(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 text-gray-700 dark:text-gray-300">
              <p className="text-sm">
                Para obtener el archivo HTML desde la plataforma, sigue estos pasos:
              </p>
              <ol className="list-decimal list-inside space-y-2 text-sm" start={1}>
                <li>En la página del reporte, presiona <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Ctrl + S</kbd> (Windows) o <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">Cmd + S</kbd> (Mac) para guardar la página</li>
                <li>Guarda el archivo con extensión <code className="px-1 py-0.5 bg-gray-200 dark:bg-gray-700 rounded text-xs">.html</code></li>
                <li>Arrastra el archivo guardado a esta página para procesarlo</li>
              </ol>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Nota:</strong> Asegúrate de guardar la página completa (HTML) y no solo una captura de pantalla. El archivo debe contener las tablas con los datos de comisiones.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowInfoDialog(false)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExtractorPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ExtractorPageContent />
    </ProtectedRoute>
  );
}

