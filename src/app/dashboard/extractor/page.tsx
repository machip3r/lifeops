'use client';

import { useState, useRef } from 'react';
import ProtectedRoute from '@/components/protected-route';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { supabaseAdmin, ContractDetail } from '@/lib/supabase';

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

interface MissingConsultant {
  consultantCode: string; // This is the asesor field (row[3])
  name: string; // Consultant name (can be same as code or different)
  email: string;
  password: string;
}

function ExtractorPageContent() {
  const { profile } = useAuth();
  const [tables, setTables] = useState<TableData[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: number; error: string }>; warnings: Array<{ row: number; message: string }> } | null>(null);
  const [showConsultantDialog, setShowConsultantDialog] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [duplicates, setDuplicates] = useState<{ contracts: string[]; details: Array<{ contract: string; ticket: string; row: number }> }>({ contracts: [], details: [] });
  const [missingConsultants, setMissingConsultants] = useState<MissingConsultant[]>([]);
  const [isCreatingConsultants, setIsCreatingConsultants] = useState(false);
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
      'Tipo Cambio',
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
          section.metadata.tipoCambio || '',
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
      alert('Por favor arrastra un archivo HTML');
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const checkMissingConsultants = async (rows: string[][], officeId: string): Promise<string[]> => {
    const consultantCodes = new Set<string>();

    // Extract unique consultant codes (asesor) from rows (column 3)
    rows.forEach(row => {
      if (row.length >= 4 && row[3]?.trim()) {
        consultantCodes.add(row[3].trim());
      }
    });

    if (consultantCodes.size === 0) return [];

    // Batch check all consultants at once
    const codesArray = Array.from(consultantCodes);
    const { data: existingConsultants } = await supabaseAdmin
      .from('consultant')
      .select('consultant_code')
      .eq('office_id', officeId)
      .in('consultant_code', codesArray);

    const existingCodes = new Set(
      (existingConsultants || [])
        .map((c: any) => c.consultant_code?.toLowerCase())
        .filter((code: string) => code)
    );

    // Find missing consultants
    const missing = codesArray.filter(code => !existingCodes.has(code.toLowerCase()));

    return missing;
  };

  const checkDuplicates = async (rows: string[][]): Promise<{ contracts: string[]; details: Array<{ contract: string; ticket: string; row: number }> }> => {
    const duplicateDetails: Array<{ contract: string; ticket: string; row: number }> = [];

    // Group rows by contract (same logic as import)
    type ContractGroup = {
      cliente: string;
      poliza: string;
      moneda: string;
      tipoCambio: string;
      asesor: string;
      rows: Array<{ rowIndex: number; data: string[] }>;
    };

    const contractGroups = new Map<string, ContractGroup>();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 5) continue;

      const cliente = row[0]?.trim();
      const poliza = row[1]?.trim();
      const moneda = row[2]?.trim();
      const tipoCambio = row[3]?.trim();
      const asesor = row[4]?.trim();

      if (!cliente || !asesor) continue;

      const contractKey = `${cliente}|${poliza}|${asesor}`;
      if (!contractGroups.has(contractKey)) {
        contractGroups.set(contractKey, {
          cliente,
          poliza,
          moneda: moneda || '',
          tipoCambio: tipoCambio || '',
          asesor,
          rows: [],
        });
      }
      contractGroups.get(contractKey)!.rows.push({
        rowIndex: i + 1,
        data: row.slice(5),
      });
    }

    // Check which contracts exist to get their IDs (for checking ticket numbers)
    const polizasToCheck = Array.from(contractGroups.values())
      .map(g => g.poliza)
      .filter((p): p is string => !!p);

    const existingContractsMap = new Map<string, { id: string; contract_number: string }>();
    if (polizasToCheck.length > 0) {
      const { data: existingContracts } = await supabaseAdmin
        .from('contract')
        .select('id, contract_number')
        .in('contract_number', polizasToCheck);

      if (existingContracts) {
        existingContracts.forEach((c: any) => {
          existingContractsMap.set(c.contract_number, c);
        });
      }
    }

    // Helper functions to parse data (same as import function)
    const mapColumn = (detailData: string[], index: number): string | null => {
      if (index >= detailData.length) return null;
      const value = detailData[index]?.trim();
      return value || null;
    };

    const parseDate = (dateStr: string | null): string | null => {
      if (!dateStr || !dateStr.trim()) return null;
      const parts = dateStr.trim().split('/');
      if (parts.length === 3) {
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2];
        return `${year}-${month}-${day}`;
      }
      return null;
    };

    // Parse numeric helper - removes commas and converts to number
    const parseNumeric = (value: string | null): number | null => {
      if (!value || !value.trim() || value.trim() === 'NULL') return null;
      // Remove commas, spaces, and other formatting
      const cleaned = value.trim().replace(/,/g, '').replace(/\s/g, '');
      const parsed = parseFloat(cleaned);
      return isNaN(parsed) ? null : parsed;
    };

    // Build detail objects for all rows (only for existing contracts)
    // For new contracts, we don't need to check since they won't have any details yet
    const detailChecks: Array<{ contractId: string; detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at' | 'contract_id'>; contract: string; row: number }> = [];

    for (const [, group] of contractGroups.entries()) {
      if (group.poliza) {
        const existingContract = existingContractsMap.get(group.poliza);
        // Only check details if the contract already exists
        if (existingContract) {
          // Build detail objects for all rows in this contract group
          // Column mapping: 1=PLAN, 2=FECHA EMISION, 3=PRODUCTO, 5=FECHA PAGO, 6=PRIMA PAGO,
          // 7=FORMA DE PAGO, 11=COMISION/HONORARIOS, 13=% COMISION, 15=PRIMA COBRO,
          // 18=ANTIGÜEDAD, 23=PRIMA META
          for (const rowInfo of group.rows) {
            try {
              const detailData = rowInfo.data;
              const detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at' | 'contract_id'> = {
                plan: mapColumn(detailData, 1), // PLAN
                product: mapColumn(detailData, 3), // PRODUCTO
                issue_date: parseDate(mapColumn(detailData, 2)), // FECHA EMISION
                payment_date: parseDate(mapColumn(detailData, 5)), // FECHA PAGO
                premium_payment: parseNumeric(mapColumn(detailData, 6)), // PRIMA PAGO
                payment_method: mapColumn(detailData, 7), // FORMA DE PAGO
                commission_honoraries: parseNumeric(mapColumn(detailData, 11)), // COMISION/HONORARIOS
                commission_percentage: parseNumeric(mapColumn(detailData, 13)), // % COMISION
                collection_premium: parseNumeric(mapColumn(detailData, 15)), // PRIMA COBRO
                seniority: mapColumn(detailData, 18), // ANTIGÜEDAD
                target_premium: parseNumeric(mapColumn(detailData, 23)), // PRIMA META
              };

              detailChecks.push({
                contractId: existingContract.id,
                detail,
                contract: group.poliza,
                row: rowInfo.rowIndex,
              });
            } catch (error) {
              // Skip rows that can't be parsed
              console.error('Error parsing detail row:', error);
            }
          }
        }
      }
    }

    // Batch check all details by comparing all columns (only for existing contracts)
    if (detailChecks.length > 0) {
      const duplicateIndices = await db.contractDetail.checkDetailsExistByAllColumns(
        detailChecks.map(({ contractId, detail }) => ({ contractId, detail }))
      );

      // Find which details are duplicates
      detailChecks.forEach(({ contract, row, detail }, index) => {
        if (duplicateIndices.has(index)) {
          const product = detail.product || 'N/A';
          duplicateDetails.push({ contract, ticket: product, row });
        }
      });
    }

    // Return empty contracts array since we no longer check for duplicate contracts
    return { contracts: [], details: duplicateDetails };
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
      setImportResult({ success: 0, errors: [{ row: 0, error: 'No se pudo determinar la oficina. Por favor contacta al soporte.' }], warnings: [] });
      return;
    }

    // Check for missing consultants first
    const missing = await checkMissingConsultants(tables[0].rows, officeId);

    if (missing.length > 0) {
      // Create consultants list - consultant_code is the asesor (row[3])
      const consultantsToCreate: MissingConsultant[] = missing.map((consultantCode, index) => {
        return {
          consultantCode, // This is the asesor field (consultant code)
          name: consultantCode, // Use consultant code as name by default (can be edited)
          email: `braulinusmac+a${index + 1}@gmail.com`, // Default test email
          password: 'Hola123!!', // Default test password
        };
      });
      setMissingConsultants(consultantsToCreate);
      setShowConsultantDialog(true);
      return;
    }

    // Check for duplicates
    setIsCheckingDuplicates(true);
    try {
      const duplicateData = await checkDuplicates(tables[0].rows);

      setIsCheckingDuplicates(false);

      if (duplicateData.details.length > 0) {
        setDuplicates(duplicateData);
        setShowDuplicateDialog(true);
        return;
      }

      // No duplicates, proceed with import
      await performImport(officeId);
    } catch (error: any) {
      setIsCheckingDuplicates(false);
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
    if (officeId) {
      await performImport(officeId);
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

      // Create auth users and consultants
      for (const consultant of missingConsultants) {
        // Create auth user using admin client
        const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
          email: consultant.email,
          password: consultant.password,
          email_confirm: true, // Auto-confirm email
        });

        if (authError) {
          throw new Error(`Error al crear usuario para ${consultant.consultantCode}: ${authError.message}`);
        }

        if (!authData.user) {
          throw new Error(`Error al crear usuario para ${consultant.consultantCode}`);
        }

        // Create consultant with auth user ID
        const { error: consultantError } = await supabaseAdmin
          .from('consultant')
          .insert({
            id: authData.user.id, // Use auth user ID as consultant ID
            office_id: officeId,
            name: consultant.name, // Consultant name
            email: consultant.email,
            consultant_code: consultant.consultantCode, // This is the asesor (consultant code)
            auth_user_id: authData.user.id,
            status: 'PENDING',
          });

        if (consultantError) {
          throw new Error(`Error al crear consultor ${consultant.consultantCode}: ${consultantError.message}`);
        }
      }

      // Close dialog
      setShowConsultantDialog(false);
      setMissingConsultants([]);

      // Check for duplicates before importing
      setIsCheckingDuplicates(true);
      try {
        const duplicateData = await checkDuplicates(tables[0].rows);

        setIsCheckingDuplicates(false);

        if (duplicateData.details.length > 0) {
          setDuplicates(duplicateData);
          setShowDuplicateDialog(true);
          return;
        }

        // No duplicates, proceed with import
        await performImport(officeId);
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
        errors: [{ row: 0, error: error.message || 'Error al crear consultores' }],
        warnings: []
      });
    } finally {
      setIsCreatingConsultants(false);
    }
  };

  const performImport = async (officeId: string) => {
    setIsImporting(true);
    setImportResult(null);

    try {
      let result;
      if (profile?.role === 'consultant') {
        result = await db.contract.importContractsFromTable(tables[0].rows, officeId, profile.id, tables[0].headers);
      } else {
        result = await db.contract.importContractsFromTable(tables[0].rows, officeId, undefined, tables[0].headers);
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
    }
  };

  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Extractor de Tablas
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Arrastra un archivo HTML para extraer tablas y descargarlas como CSV
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
              Arrastra tu archivo HTML aquí, o haz clic para explorar
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Soporta archivos .html y .htm
            </p>
          </div>
        </div>
      </div>

      {/* Results */}
      {tables.length > 0 && (
        <div className="mt-8 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
              Tabla Extraída ({tables[0].rows.length} filas)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={handleImport}
                disabled={isImporting || isCheckingDuplicates}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCheckingDuplicates ? 'Verificando duplicados...' : isImporting ? 'Importando...' : 'Importar a Base de Datos'}
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
                        <li key={idx}>Fila {warning.row}: {warning.message}</li>
                      ))}
                      {importResult.warnings.length > 50 && (
                        <li>... y {importResult.warnings.length - 50} advertencias más</li>
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
                    ? `✅ ¡Se importaron exitosamente ${importResult.success} contrato(s)!`
                    : `⚠️ Importación completada: ${importResult.success} importados, ${importResult.errors.length} error(es)`
                  }
                </h3>
                {importResult.errors.length > 0 && (
                  <div className="text-sm text-yellow-700 dark:text-yellow-300 max-h-60 overflow-y-auto">
                    <ul className="list-disc list-inside space-y-1">
                      {importResult.errors.slice(0, 50).map((error, idx) => (
                        <li key={idx}>Fila {error.row}: {error.error}</li>
                      ))}
                      {importResult.errors.length > 50 && (
                        <li>... y {importResult.errors.length - 50} errores más</li>
                      )}
                    </ul>
                  </div>
                )}
              </div>
            </>
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

      {/* Loading Overlay */}
      {(isCheckingDuplicates || isImporting) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                {isCheckingDuplicates ? 'Verificando Duplicados' : 'Importando Datos'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {isCheckingDuplicates
                  ? 'Por favor espera mientras verificamos la base de datos por registros existentes...'
                  : 'Por favor espera mientras importamos tus datos...'}
              </p>
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
                        <li key={idx}>
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

      {/* Consultant Creation Dialog */}
      {showConsultantDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                Crear Consultores Faltantes
              </h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Los siguientes consultores no se encontraron en la base de datos. Por favor proporciona correo electrónico y contraseña para crearlos:
              </p>

              <div className="space-y-4 mb-6">
                {missingConsultants.map((consultant, index) => (
                  <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">
                      Código del Consultor: {consultant.consultantCode}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Nombre del Consultor
                        </label>
                        <input
                          type="text"
                          value={consultant.name}
                          onChange={(e) => {
                            const updated = [...missingConsultants];
                            updated[index].name = e.target.value;
                            setMissingConsultants(updated);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="Nombre del consultor"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Correo Electrónico *
                        </label>
                        <input
                          type="email"
                          value={consultant.email}
                          onChange={(e) => {
                            const updated = [...missingConsultants];
                            updated[index].email = e.target.value;
                            setMissingConsultants(updated);
                          }}
                          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                          placeholder="consultor@ejemplo.com"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Contraseña * (mín. 8 caracteres)
                        </label>
                        <input
                          type="password"
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
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Código del Consultor (Asesor) - Solo Lectura
                      </label>
                      <input
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
                  {isCreatingConsultants ? 'Creando...' : 'Crear Consultores e Importar'}
                </button>
              </div>
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

