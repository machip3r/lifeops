'use client';

import { useState, useRef } from 'react';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';

interface ContractorMetadata {
  contratante?: string;
  poliza?: string;
  oficina?: string;
  moneda?: string;
  tipoCambio?: string;
  asesor?: string;
}

interface TableData {
  headers: string[];
  rows: string[][];
  metadata?: ContractorMetadata;
  sectionName?: string;
}

function ExtractorPageContent() {
  const { profile } = useAuth();
  const [tables, setTables] = useState<TableData[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: number; error: string }> } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

              if (upperText.includes('CONTRATANTE')) metadata.contratante = value;
              else if (upperText.includes('POLIZA')) metadata.poliza = value;
              else if (upperText.includes('OFICINA')) metadata.oficina = value;
              else if (upperText.includes('MONEDA')) metadata.moneda = value;
              else if (upperText.includes('TIPO DE CAMBIO')) metadata.tipoCambio = value;
              else if (upperText.includes('ASESOR')) metadata.asesor = value;

              i++;
            }
          }

          const metadataKey = `${metadata.contratante || ''}_${metadata.poliza || ''}_${rowIndex}`;

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

    // Add metadata columns to headers
    const combinedHeaders = [
      'Cliente',
      'Poliza',
      'Moneda',
      'Asesor',
      ...mainHeaders
    ];

    // Combine all rows with their metadata
    const combinedRows: string[][] = [];
    allSections.forEach((section) => {
      section.rows.forEach((row) => {
        combinedRows.push([
          section.metadata.contratante || '',
          section.metadata.poliza || '',
          section.metadata.moneda || '',
          section.metadata.asesor || '',
          ...row
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
      alert('Error al copiar al portapapeles. Por favor, intenta de nuevo.');
    }
  };

  const copyAllToClipboard = async () => {
    try {
      if (tables.length > 0) {
        const tableText = convertToClipboardFormat(tables[0]);
        await navigator.clipboard.writeText(tableText);
        alert('¡Tabla copiada al portapapeles!');
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      alert('Error al copiar al portapapeles. Por favor, intenta de nuevo.');
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

  const handleFile = (file: File) => {
    setFileName(file.name.replace(/\.[^/.]+$/, ''));

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      const extractedTables = parseHTMLTables(content);
      setTables(extractedTables);
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const htmlFile = files.find(file => file.type === 'text/html' || file.name.endsWith('.html'));

    if (htmlFile) {
      handleFile(htmlFile);
    } else {
      alert('Please drop an HTML file');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleImport = async () => {
    if (tables.length === 0 || tables[0].rows.length === 0) {
      alert('No data to import. Please extract a table first.');
      return;
    }

    if (!profile?.id) {
      alert('You must be logged in to import data.');
      return;
    }

    setIsImporting(true);
    setImportResult(null);

    try {
      let result;
      if (profile.role === 'consultant') {
        // Consultants can only import for themselves
        const officeId = profile.office_id || profile.id;
        if (!officeId) {
          setImportResult({ success: 0, errors: [{ row: 0, error: 'Unable to determine office. Please contact support.' }] });
          setIsImporting(false);
          return;
        }
        result = await db.contract.importContractsFromTable(tables[0].rows, officeId, profile.id);
      } else {
        // Promotory (office) can import for any consultant in their office
        result = await db.contract.importContractsFromTable(tables[0].rows, profile.id);
      }
      setImportResult(result);
    } catch (error: any) {
      console.error('Import error:', error);
      setImportResult({ 
        success: 0, 
        errors: [{ row: 0, error: error.message || 'Unknown error occurred during import' }] 
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Tables extractor
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Drop an HTML file to extract tables and download as CSV
      </p>

      {/* File Drop Zone */}
      <div
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
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".html,.htm"
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
              Drop your HTML file here, or click to browse
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Supports .html and .htm files
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      {tables.length > 0 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Extracted Table ({tables[0].rows.length} rows)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={isImporting}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : 'Import to Database'}
              </button>
              <button
                onClick={downloadAllCSV}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Download CSV
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
            <div className={`rounded-lg p-4 border ${
              importResult.errors.length === 0 
                ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800' 
                : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
            }`}>
              <h3 className={`text-sm font-semibold mb-2 ${
                importResult.errors.length === 0
                  ? 'text-green-800 dark:text-green-200'
                  : 'text-yellow-800 dark:text-yellow-200'
              }`}>
                {importResult.errors.length === 0 
                  ? `Successfully imported ${importResult.success} contract(s)!`
                  : `Import completed: ${importResult.success} imported, ${importResult.errors.length} error(s)`
                }
              </h3>
              {importResult.errors.length > 0 && (
                <div className="text-sm text-yellow-700 dark:text-yellow-300 max-h-60 overflow-y-auto">
                  <ul className="list-disc list-inside space-y-1">
                    {importResult.errors.slice(0, 50).map((error, idx) => (
                      <li key={idx}>Row {error.row}: {error.error}</li>
                    ))}
                    {importResult.errors.length > 50 && (
                      <li>... and {importResult.errors.length - 50} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}

          {tables.map((table, index) => (
            <div
              key={index}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6"
            >
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700">
                    <tr>
                      {table.headers.map((header, headerIndex) => (
                        <th
                          key={headerIndex}
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
                        key={rowIndex}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {row.map((cell, cellIndex) => (
                          <td
                            key={cellIndex}
                            className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100"
                          >
                            {cell || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
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

