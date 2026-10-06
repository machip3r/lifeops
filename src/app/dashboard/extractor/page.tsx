'use client';

import { useState, useRef, useLayoutEffect, useCallback, memo } from 'react';
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
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';

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

interface MissingConsultant {
  consultantCode: string; // This is the asesor field (row[5] in combined row: Cliente, Poliza, TIPO POLIZA, Moneda, Tipo Cambio, Asesor)
  name: string;
  email: string;
  password: string;
}

type NewPolicyDateRow = {
  key: string;
  contractNumber: string;
  clientName: string;
  priorPaymentDate: string;
};

type MissingIssueDateRow = {
  key: string;
  contractNumber: string;
  clientName: string;
  rowIndexes: number[];
  issueDate: string;
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

// Cell with local state so typing doesn't re-render the whole table; commits to parent on blur
const EditableCell = memo(function EditableCell({
  value,
  tableIndex,
  rowIndex,
  cellIndex,
  isEditable,
  updateCell,
  onFocusEmpty,
  onBlurEmpty,
}: {
  value: string;
  tableIndex: number;
  rowIndex: number;
  cellIndex: number;
  isEditable: boolean;
  updateCell: (ti: number, ri: number, ci: number, v: string) => void;
  onFocusEmpty: (ti: number, ri: number, ci: number) => void;
  onBlurEmpty: () => void;
}) {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from parent value when it changes and input is not focused
  // Using useLayoutEffect for DOM synchronization (acceptable for input value sync)
  useLayoutEffect(() => {
    if (!isFocused && value !== localValue) {
      setLocalValue(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, isFocused]); // localValue intentionally excluded to avoid infinite loop

  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (localValue !== value) {
      updateCell(tableIndex, rowIndex, cellIndex, localValue);
    }
    onBlurEmpty();
  }, [localValue, value, tableIndex, rowIndex, cellIndex, updateCell, onBlurEmpty]);

  const handleFocus = useCallback(() => {
    setIsFocused(true);
    onFocusEmpty(tableIndex, rowIndex, cellIndex);
  }, [onFocusEmpty, tableIndex, rowIndex, cellIndex]);

  if (!isEditable) {
    return (
      <span className="block px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100">
        {value || '-'}
      </span>
    );
  }

  return (
    <input
      ref={inputRef}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onFocus={() => {
        if (String(value).trim() === '') handleFocus();
      }}
      onBlur={handleBlur}
      className="w-full min-w-16 px-2 py-1.5 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
    />
  );
});

/** When true, promotoría must enter email/password for new asesores instead of auto-create. */
const REQUIRE_MANUAL_CONSULTANT_CREDENTIALS =
  process.env.NEXT_PUBLIC_IMPORT_MANUAL_CONSULTANT_CREDENTIALS === 'true';

function ExtractorPageContent() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [tables, setTables] = useState<TableData[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: number; error: string }>; warnings: Array<{ row: number; message: string }> } | null>(null);
  const [showConsultantDialog, setShowConsultantDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<{ contracts: string[]; details: Array<{ contract: string; ticket: string; row: number }> }>({ contracts: [], details: [] });
  const [missingConsultants, setMissingConsultants] = useState<MissingConsultant[]>([]);
  const [isCreatingConsultants, setIsCreatingConsultants] = useState(false);
  const [allCellsEditable, setAllCellsEditable] = useState(false);
  const [focusedEmptyCell, setFocusedEmptyCell] = useState<{ tableIndex: number; rowIndex: number; cellIndex: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportDatesDialog, setShowImportDatesDialog] = useState(false);
  const [dialogFileIssueDate, setDialogFileIssueDate] = useState('');
  const [newPolicyDateRows, setNewPolicyDateRows] = useState<NewPolicyDateRow[]>([]);
  const [missingIssueDateRows, setMissingIssueDateRows] = useState<MissingIssueDateRow[]>([]);
  const [importDateErrors, setImportDateErrors] = useState<Record<string, string>>({});
  const [confirmedImportMeta, setConfirmedImportMeta] = useState<{
    fileIssueDate: string;
    priorPaymentByContract: Record<string, string>;
  } | null>(null);


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

  const convertToClipboardFormat = (table: TableData): string => {
    // Use tab-separated values (TSV) for better Excel compatibility
    const lines: string[] = [];

    // Add headers
    lines.push(table.headers.join('\t'));

    // Add rows
    table.rows.forEach(row => {
      // Replace newlines and tabs in cells, use tab as separator
      const tsvRow = row.map(cell => {
        const cellStr = String(cell || '');
        // Replace tabs with spaces and newlines with spaces for cleaner paste
        return cellStr.replace(/\t/g, ' ').replace(/\n/g, ' ').replace(/\r/g, '');
      }).join('\t');
      lines.push(tsvRow);
    });

    return lines.join('\n');
  };

  const copyToClipboard = async (table: TableData, index: number) => {
    try {
      const text = convertToClipboardFormat(table);
      await navigator.clipboard.writeText(text);

      // Show temporary success message
      const button = document.getElementById(`copy-btn-${index}`);
      if (button) {
        const originalText = button.textContent;
        button.textContent = '¡Copiado!';
        button.classList.add('bg-green-600');
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove('bg-green-600');
        }, 2000);
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error('Error al copiar al portapapeles. Por favor, intenta de nuevo.');
    }
  };

  const copyAllToClipboard = async () => {
    try {
      if (tables.length > 0) {
        const tableText = convertToClipboardFormat(tables[0]);
        await navigator.clipboard.writeText(tableText);
        toast.success('Tabla copiada al portapapeles');
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast.error('Error al copiar al portapapeles. Por favor, intenta de nuevo.');
    }
  };

  const downloadCSV = (table: TableData, index: number) => {
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
      downloadCSV(tables[0], 0);
    }
  };

  const updateCell = useCallback((tableIndex: number, rowIndex: number, cellIndex: number, value: string) => {
    setTables((prev) => {
      const next = prev.map((t, ti) => {
        if (ti !== tableIndex) return t;
        return {
          ...t,
          rows: t.rows.map((row, ri) => {
            if (ri !== rowIndex) return row;
            const newRow = [...row];
            newRow[cellIndex] = value;
            return newRow;
          }),
        };
      });
      return next;
    });
  }, []);

  const handleFocusEmpty = useCallback((ti: number, ri: number, ci: number) => {
    setFocusedEmptyCell({ tableIndex: ti, rowIndex: ri, cellIndex: ci });
  }, []);

  const handleBlurEmpty = useCallback(() => {
    setFocusedEmptyCell(null);
  }, []);

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
  };

  const clearUploadedFiles = () => {
    setUploadedFiles([]);
    setTables([]);
    setImportResult(null);
    setFileName('');
  };

  const extractFromFiles = (files: UploadedFile[]) => {
    if (files.length === 0) {
      toast.error('Sube al menos un archivo HTML y luego haz clic en Extraer');
      return;
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
        setIsExtracting(false);
        toast.error('No se encontraron tablas válidas. Abre el reporte de comisiones en el navegador (o sube un HTML guardado) e intenta de nuevo.');
        return;
      }

      // Preserve original row order from the uploaded files
      setFileName(files.map(f => f.name.replace(/\.[^/.]+$/, '')).join('_'));
      setTables([{ headers: combinedHeaders, rows: allRows, metadata: undefined, sectionName: 'combined' }]);
      setImportResult(null);
    } catch (err) {
      console.error(err);
      toast.error('Error al extraer datos. Revisa que los archivos sean HTML válidos.');
    } finally {
      setIsExtracting(false);
    }
  };

  const handleExtract = () => {
    extractFromFiles(uploadedFiles);
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

  const handleImport = async () => {
    if (tables.length === 0 || tables[0].rows.length === 0) {
      setImportResult({ success: 0, errors: [{ row: 0, error: 'No hay datos para importar. Por favor extrae una tabla primero.' }], warnings: [] });
      return;
    }

    if (!profile?.id) {
      setImportResult({ success: 0, errors: [{ row: 0, error: 'Debes iniciar sesión para importar datos.' }], warnings: [] });
      return;
    }

    const officeId = profile.role === 'consultant' ? (profile.office_id || profile.id) : profile.id;
    if (!officeId) {
      setImportResult({ success: 0, errors: [{ row: 0, error: 'No se pudo determinar la promotoría. Por favor contacta al soporte.' }], warnings: [] });
      return;
    }

    if (profile.role === 'consultant' && !profile.consultant_code?.trim()) {
      setImportResult({
        success: 0,
        errors: [{
          row: 0,
          error: 'Tu perfil de asesor no tiene código. Contacta a tu promotoría.',
        }],
        warnings: [],
      });
      return;
    }

    setIsCheckingDuplicates(true);
    setImportResult(null);
    setImportDateErrors({});

    try {
      const headers = tables[0].headers || [];
      const map = headerIndexMap(headers);
      const polizaIdx = map.get('POLIZA') ?? 1;
      const clienteIdx = map.get('CLIENTE') ?? 0;
      const issueIdx = map.get('FECHAEMISION') ?? 8;
      const asesorIdx = map.get('ASESOR') ?? 5;

      // Asesores only import rows for their own code
      let rowsForImport = tables[0].rows;
      let skippedOtherCodes = 0;
      if (profile.role === 'consultant' && profile.consultant_code) {
        const myCode = profile.consultant_code.trim().toLowerCase();
        const kept: string[][] = [];
        for (const row of tables[0].rows) {
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

      const newPolicyMap = new Map<string, NewPolicyDateRow>();
      const missingIssueMap = new Map<string, MissingIssueDateRow>();

      rowsForImport.forEach((row, rowIndex) => {
        const rawNumber = (row[polizaIdx] ?? '').trim();
        const contractNumber = rawNumber.replace(/,/g, '').replace(/\s+/g, '');
        const clientName = (row[clienteIdx] ?? '').trim();
        const issueRaw = (row[issueIdx] ?? '').trim();
        const hasIssue = Boolean(parseFlexibleDateToIso(issueRaw));

        const isNew =
          !contractNumber || !existingSet.has(contractNumber);
        if (isNew) {
          const key = contractNumber || `__unnamed__:${clientName.toLowerCase() || rowIndex}`;
          if (!newPolicyMap.has(key)) {
            newPolicyMap.set(key, {
              key,
              contractNumber: contractNumber || '(sin número)',
              clientName: clientName || '—',
              priorPaymentDate: '',
            });
          }
        }

        if (!hasIssue) {
          const key = contractNumber || `__unnamed__:${clientName.toLowerCase() || rowIndex}`;
          const existing = missingIssueMap.get(key);
          if (existing) {
            existing.rowIndexes.push(rowIndex);
          } else {
            missingIssueMap.set(key, {
              key,
              contractNumber: contractNumber || '(sin número)',
              clientName: clientName || '—',
              rowIndexes: [rowIndex],
              issueDate: '',
            });
          }
        }
      });

      // Persist scoped rows for the import dialog → continue flow
      if (rowsForImport !== tables[0].rows) {
        setTables([{ ...tables[0], rows: rowsForImport }, ...tables.slice(1)]);
      }

      const suggested = suggestFileIssueDateFromPaymentColumn(headers, rowsForImport);
      setDialogFileIssueDate(suggested);
      setNewPolicyDateRows([...newPolicyMap.values()]);
      setMissingIssueDateRows([...missingIssueMap.values()]);
      setShowImportDatesDialog(true);
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

    for (const row of newPolicyDateRows) {
      const prior = row.priorPaymentDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(prior)) {
        errors[`prior:${row.key}`] = 'Obligatoria para pólizas nuevas.';
      } else if (prior > todayIso) {
        errors[`prior:${row.key}`] = 'No puede ser una fecha futura.';
      }
    }

    for (const row of missingIssueDateRows) {
      const issue = row.issueDate.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issue)) {
        errors[`issue:${row.key}`] = 'Obligatoria para importar.';
      } else if (issue > todayIso) {
        errors[`issue:${row.key}`] = 'No puede ser una fecha futura.';
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(fileIso) && issue >= fileIso) {
        errors[`issue:${row.key}`] =
          'Debe ser anterior a la fecha del archivo de comisiones.';
      }
    }

    if (Object.keys(errors).length > 0) {
      setImportDateErrors(errors);
      return;
    }
    setImportDateErrors({});

    // Write missing FECHA EMISION (+ mes/año) into the editable table (sync for import)
    const headers = tables[0].headers || [];
    const map = headerIndexMap(headers);
    const issueIdx = map.get('FECHAEMISION') ?? 8;
    const mesIdx = map.get('MESEMISION') ?? 9;
    const anioIdx = map.get('ANOEMISION') ?? map.get('ANIOEMISION') ?? 10;
    const nextRows = tables[0].rows.map((r) => [...r]);
    for (const item of missingIssueDateRows) {
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
    for (const row of newPolicyDateRows) {
      priorPaymentByContract[row.key] = row.priorPaymentDate.trim();
    }

    const meta = {
      fileIssueDate: fileIso,
      priorPaymentByContract,
    };
    setConfirmedImportMeta(meta);
    setShowImportDatesDialog(false);
    await continueImportAfterDates(officeId, tableForImport, meta);
  };

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
      // Manual mode: force email/password dialog (env flag).
      if (REQUIRE_MANUAL_CONSULTANT_CREDENTIALS) {
        setMissingConsultants(
          missingEntries.map((c) => ({
            consultantCode: c.code,
            name: c.name || c.code,
            email: '',
            password: '',
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
          error instanceof Error ? error.message : 'No se pudieron crear los asesores faltantes.';
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

  const handleCreateConsultants = async () => {
    if (!profile?.id) return;

    const officeId = profile.role === 'consultant' ? (profile.office_id || profile.id) : profile.id;
    setIsCreatingConsultants(true);

    try {
      // Validate all consultants have email and password
      for (const consultant of missingConsultants) {
        if (!consultant.email || !consultant.password) {
          throw new Error(`Por favor proporciona correo electrónico y contraseña para ${consultant.consultantCode}`);
        }
        if (consultant.password.length < 8) {
          throw new Error(`La contraseña para ${consultant.consultantCode} debe tener al menos 8 caracteres`);
        }
      }

      const res = await authFetch('/api/extractor/create-consultants', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'manual',
          officeId,
          consultants: missingConsultants.map(c => ({
            consultantCode: c.consultantCode,
            name: c.name || c.consultantCode,
            email: c.email,
            password: c.password,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'No se pudieron crear los asesores.');
      }

      // Close dialog
      setShowConsultantDialog(false);
      setMissingConsultants([]);

      // Check for duplicates before importing
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

        // No duplicates, proceed with import
        if (confirmedImportMeta) {
          await performImport(officeId, tables[0], confirmedImportMeta);
        }
      } catch (error: any) {
        setIsCheckingDuplicates(false);
        setImportResult({
          success: 0,
          errors: [{ row: 0, error: error.message || 'Error al verificar duplicados' }],
          warnings: []
        });
      }
    } catch (error: any) {
      console.error('Error creating consultants:', error);
      setImportResult({
        success: 0,
        errors: [{ row: 0, error: error.message || 'Error al crear asesores' }],
        warnings: []
      });
    } finally {
      setIsCreatingConsultants(false);
    }
  };

  const performImport = async (
    officeId: string,
    table: TableData,
    meta: { fileIssueDate: string; priorPaymentByContract: Record<string, string> },
  ) => {
    setIsImporting(true);
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
    } catch (error: any) {
      console.error('Import error:', error);
      setImportResult({
        success: 0,
        errors: [{ row: 0, error: error.message || 'Error desconocido durante la importación' }],
        warnings: []
      });
    } finally {
      setIsImporting(false);
      setImportProgress(null);
    }
  };

  const isIsoDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
  const canContinueImportDates =
    isIsoDate(dialogFileIssueDate) &&
    newPolicyDateRows.every((row) => isIsoDate(row.priorPaymentDate)) &&
    missingIssueDateRows.every((row) => isIsoDate(row.issueDate));

  return (
    <div>
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">
          Importar datos
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          {profile?.role === 'consultant'
            ? 'Carga tus archivos HTML de comisiones. Solo se importarán las pólizas con tu código de asesor.'
            : 'Carga los archivos HTML de comisiones extraídos del portal. Luego importa pólizas, asesores, clientes y detalles.'}
        </p>
      </div>
      <div className="flex justify-end mb-8">
        <button
          onClick={() => setShowInfoDialog(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          ¿Cómo obtener el archivo HTML?
        </button>
      </div>

      {/* File Drop Zone */}
      <div
        role="button"
        tabIndex={0}
        className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
          }`}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm,.mhtml,.mht"
          multiple
          onChange={handleFileInput}
          className="hidden"
        />
        <div className="space-y-4">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            stroke="currentColor"
            fill="none"
            viewBox="0 0 48 48"
          >
            <path
              d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8m0-8h8m-8 0H28m-12 8h20m-12 0v-8m0 8l-4-4m4 4l4-4"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              Arrastra uno o más archivos HTML aquí, o haz clic para seleccionar
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Soporta archivos .html, .htm, .mhtml y .mht (varios a la vez)
            </p>
          </div>
        </div>
      </div>

      {/* Uploaded files list + Extract button */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Archivos ({uploadedFiles.length}):
              </span>
              {uploadedFiles.map((f, i) => (
                <span
                  key={`file-${i}-${f.name}`}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-sm text-gray-800 dark:text-gray-200"
                >
                  {f.name}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeUploadedFile(i);
                    }}
                    className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 hover:text-red-600 dark:hover:text-red-400"
                    aria-label={`Quitar ${f.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </span>
              ))}
              <button
                type="button"
                onClick={clearUploadedFiles}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
              >
                Limpiar todo
              </button>
            </div>
            <button
              type="button"
              onClick={handleExtract}
              disabled={isExtracting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {isExtracting ? 'Extrayendo...' : 'Extraer datos'}
            </button>
          </div>
        </div>
      )}

      {/* Results */}
      {tables.length > 0 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Tabla Extraída ({tables[0].rows.length} filas)
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Las celdas vacías son editables. Activa la opción para editar todas. Los cambios se usan al importar o descargar CSV.
                Al importar se pedirán fechas faltantes (emisión del archivo, pólizas nuevas y filas sin fecha de emisión).
              </p>
              <label className="inline-flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allCellsEditable}
                  onChange={(e) => setAllCellsEditable(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  Permitir editar todas las celdas
                </span>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => void handleImport()}
                disabled={isImporting || isCheckingDuplicates}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingDuplicates ? 'Preparando…' : isImporting ? 'Importando...' : 'Importar a Base de Datos'}
              </button>
              <button
                onClick={downloadAllCSV}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Descargar CSV
              </button>
              <button
                onClick={copyAllToClipboard}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
              >
                Copiar
              </button>
            </div>
          </div>

          {importResult && (
            <>
              {/* Warnings Section */}
              {importResult.warnings && importResult.warnings.length > 0 && (
                <div className="rounded-lg p-4 border bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 mb-4">
                  <h3 className="text-sm font-semibold mb-2 text-blue-800 dark:text-blue-200">
                    ⚠️ Advertencias de Importación ({importResult.warnings.length})
                  </h3>
                  <p className="text-xs text-blue-700 dark:text-blue-300 mb-2">
                    Los siguientes elementos se omitieron porque ya existen en la base de datos:
                  </p>
                  <div className="text-sm text-blue-700 dark:text-blue-300 max-h-60 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1">
                      {importResult.warnings.slice(0, 50).map((warning, idx) => (
                        <li key={`warn-${idx}-${warning.row}`}>
                          {warning.row > 0 ? `Fila ${warning.row}: ` : ''}
                          {warning.message}
                        </li>
                      ))}
                      {importResult.warnings.length > 50 && (
                        <li key="warn-more">
                          ... y {importResult.warnings.length - 50} advertencias más
                        </li>
                      )}
                    </ul>
                  </div>
                </div>
              )}

              {/* Results Section */}
              <div className={`rounded-lg p-4 border ${importResult.errors.length === 0
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                }`}>
                <h3 className={`text-sm font-semibold mb-2 ${importResult.errors.length === 0
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-yellow-800 dark:text-yellow-200'
                  }`}>
                  {importResult.errors.length === 0
                    ? `¡Se importaron exitosamente ${importResult.success} póliza(s)!`
                    : `Importación completada: ${importResult.success} importados, ${importResult.errors.length} error(es)`
                  }
                </h3>
                {importResult.errors.length > 0 && (
                  <div className="text-sm text-yellow-700 dark:text-yellow-300 max-h-60 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1">
                      {importResult.errors.slice(0, 50).map((error, idx) => (
                        <li key={`err-${idx}-${error.row}`}>
                          {error.row > 0 ? `Fila ${error.row}: ` : ''}
                          {error.error}
                        </li>
                      ))}
                      {importResult.errors.length > 50 && (
                        <li key="err-more">
                          ... y {importResult.errors.length - 50} errores más
                        </li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}

          {tables.map((table, index) => (
            <div
              key={table.sectionName ?? 'table'}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {table.headers.map((header, headerIndex) => (
                        <th
                          key={`${header}-${headerIndex}`}
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {table.rows.map((row, rowIndex) => (
                      <tr
                        key={`row-${rowIndex}`}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {row.map((cell, cellIndex) => {
                          const value = row[cellIndex] ?? '';
                          const isEmpty = String(value).trim() === '';
                          const isFocusedEmpty =
                            focusedEmptyCell?.tableIndex === index &&
                            focusedEmptyCell?.rowIndex === rowIndex &&
                            focusedEmptyCell?.cellIndex === cellIndex;
                          const isEditable = allCellsEditable || isEmpty || isFocusedEmpty;
                          return (
                            <td key={`${String(cell ?? '')}-${cellIndex}`} className="px-1 py-1">
                              <EditableCell
                                value={value}
                                tableIndex={index}
                                rowIndex={rowIndex}
                                cellIndex={cellIndex}
                                isEditable={isEditable}
                                updateCell={updateCell}
                                onFocusEmpty={handleFocusEmpty}
                                onBlurEmpty={handleBlurEmpty}
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Loading Overlay */}
      {(isExtracting || isCheckingDuplicates || isImporting) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
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

      {/* Import dates dialog (file issue + per-policy prior + missing FECHA EMISION) */}
      {showImportDatesDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                  Fechas para importar
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  La fecha del archivo se sugiere desde la columna FECHA PAGO (fecha de cobro).
                  Las pólizas nuevas requieren su último pago previo, y las filas sin fecha de
                  emisión deben completarse para poder importar.
                </p>
              </div>

              <FormField
                label="Fecha de emisión del archivo"
                htmlFor="import-file-issue-date"
                variant="auth"
                error={importDateErrors.issueDate}
                hint="Detectada automáticamente desde FECHA PAGO; puedes corregirla"
              >
                <Input
                  id="import-file-issue-date"
                  type="date"
                  value={dialogFileIssueDate}
                  max={todayIsoDate()}
                  onChange={(e) => {
                    setDialogFileIssueDate(e.target.value);
                    setImportDateErrors((prev) => {
                      const next = { ...prev };
                      delete next.issueDate;
                      return next;
                    });
                  }}
                  required
                />
              </FormField>

              {newPolicyDateRows.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Último pago previo (pólizas nuevas)
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Indica, por póliza, la fecha del <strong>último pago real</strong> conocido
                    (puede ser más reciente que el archivo si el archivo es viejo). Sirve para
                    calcular el próximo cobro. No se admiten fechas futuras.
                  </p>
                  <div className="space-y-3">
                    {newPolicyDateRows.map((row, index) => (
                      <div
                        key={row.key}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                      >
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                          {row.contractNumber}
                          <span className="text-gray-500 dark:text-gray-400 font-normal">
                            {' '}
                            · {row.clientName}
                          </span>
                        </p>
                        <FormField
                          label="Último pago conocido"
                          htmlFor={`prior-payment-${index}`}
                          variant="auth"
                          error={importDateErrors[`prior:${row.key}`]}
                        >
                          <Input
                            id={`prior-payment-${index}`}
                            type="date"
                            value={row.priorPaymentDate}
                            max={todayIsoDate()}
                            onChange={(e) => {
                              const value = e.target.value;
                              setNewPolicyDateRows((prev) =>
                                prev.map((r) =>
                                  r.key === row.key
                                    ? { ...r, priorPaymentDate: value }
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
                        </FormField>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {missingIssueDateRows.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Fecha de emisión faltante
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Estas pólizas no traen FECHA EMISION en el archivo. Debe ser{' '}
                    <strong>anterior</strong> a la fecha del archivo de comisiones (hoy sí se
                    permite si el archivo es más reciente).
                  </p>
                  <div className="space-y-3">
                    {missingIssueDateRows.map((row, index) => {
                      const todayIso = todayIsoDate();
                      const dayBeforeFile = dayBeforeIso(dialogFileIssueDate.trim());
                      const issueMax = dayBeforeFile
                        ? minIsoDate(todayIso, dayBeforeFile)
                        : todayIso;
                      return (
                        <div
                          key={row.key}
                          className="rounded-lg border border-gray-200 dark:border-gray-700 p-4"
                        >
                          <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                            {row.contractNumber}
                            <span className="text-gray-500 dark:text-gray-400 font-normal">
                              {' '}
                              · {row.clientName}
                              {row.rowIndexes.length > 1
                                ? ` · ${row.rowIndexes.length} filas`
                                : ''}
                            </span>
                          </p>
                          <FormField
                            label="Fecha de emisión"
                            htmlFor={`missing-issue-${index}`}
                            variant="auth"
                            error={importDateErrors[`issue:${row.key}`]}
                          >
                            <Input
                              id={`missing-issue-${index}`}
                              type="date"
                              value={row.issueDate}
                              max={issueMax}
                              onChange={(e) => {
                                const value = e.target.value;
                                setMissingIssueDateRows((prev) =>
                                  prev.map((r) =>
                                    r.key === row.key ? { ...r, issueDate: value } : r,
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
                          </FormField>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowImportDatesDialog(false);
                    setImportDateErrors({});
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmImportDates()}
                  disabled={!canContinueImportDates}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:pointer-events-none disabled:hover:bg-green-600"
                >
                  Continuar importación
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Consultant Creation Dialog */}
      {showConsultantDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Crear Asesores Faltantes
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Los siguientes asesores no se encontraron en la base de datos. Por favor proporciona correo electrónico y contraseña para crearlos:
              </p>

              <div className="space-y-4 mb-6">
                {missingConsultants.map((consultant, index) => (
                  <div key={consultant.consultantCode} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                      Código del Asesor: {consultant.consultantCode}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor={`consultant-name-${index}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nombre del Asesor
                        </label>
                        <input
                          id={`consultant-name-${index}`}
                          type="text"
                          value={consultant.name}
                          onChange={(e) => {
                            const updated = [...missingConsultants];
                            updated[index].name = e.target.value;
                            setMissingConsultants(updated);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="Nombre del asesor"
                        />
                      </div>
                      <div>
                        <label htmlFor={`consultant-email-${index}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Correo Electrónico *
                        </label>
                        <input
                          id={`consultant-email-${index}`}
                          type="email"
                          value={consultant.email}
                          onChange={(e) => {
                            const updated = [...missingConsultants];
                            updated[index].email = e.target.value;
                            setMissingConsultants(updated);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="asesor@ejemplo.com"
                        />
                      </div>
                      <div>
                        <label htmlFor={`consultant-password-${index}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Contraseña * (mín. 8 caracteres)
                        </label>
                        <PasswordInput
                          id={`consultant-password-${index}`}
                          value={consultant.password}
                          onChange={(e) => {
                            const updated = [...missingConsultants];
                            updated[index].password = e.target.value;
                            setMissingConsultants(updated);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="••••••••"
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label htmlFor={`consultant-code-${index}`} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Código del Asesor (Asesor) - Solo Lectura
                      </label>
                      <input
                        id={`consultant-code-${index}`}
                        type="text"
                        value={consultant.consultantCode}
                        disabled
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowConsultantDialog(false);
                    setMissingConsultants([]);
                  }}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  disabled={isCreatingConsultants}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreateConsultants}
                  disabled={isCreatingConsultants}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingConsultants ? 'Creando...' : 'Crear Asesores e Importar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

