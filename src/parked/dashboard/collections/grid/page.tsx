'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, Paperclip, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/toast';
import { SortableTh } from '@/components/sortable-th';
import { TablePagination } from '@/components/table-pagination';
import { Button } from '@/components/ui/button';
import { AppDialog } from '@/components/ui/app-dialog';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  COLLECTION_STATUS_OPTIONS,
  MONTH_COLUMNS,
} from '@/lib/collections/constants';
import type {
  CollectionMonthCell,
  CollectionsGridRow,
} from '@/lib/collections/service';
import { DEFAULT_PAGE_SIZE } from '@/lib/pagination';
import type { CollectionStatus } from '@/lib/supabase';
import { PROJECT_NAME_OPTIONS } from '@/lib/contracts/project-names';
import {
  getDocumentSignedUrl,
  uploadPaymentEvidence,
} from '@/lib/documents/upload';
import {
  nextSortState,
  sortRows,
  type SortDir,
} from '@/lib/table-sort';
import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  LIMITS,
} from '@/lib/validation/schemas';
import {
  clearCollectionPaymentAction,
  getCollectionsGridAction,
  updateCollectionStatusAction,
  updatePaymentChannelAction,
  updateProjectNameAction,
  upsertCollectionPaymentAction,
} from '@/parked/dashboard/collections/grid/actions';

type PaymentDialogState = {
  row: CollectionsGridRow;
  month: number;
  cell: CollectionMonthCell;
};

function currentYear(): number {
  return new Date().getFullYear();
}

const GRID_COLUMN_COUNT = 11 + MONTH_COLUMNS.length;

type SortKey =
  | 'consultantCode'
  | 'consultantName'
  | 'contractNumber'
  | 'clientName'
  | 'projectName'
  | 'currency'
  | 'paymentMethod'
  | 'paymentChannel'
  | 'collectionPremium'
  | 'collectionDay'
  | 'collectionStatus';

const COLLECTIONS_SORT_GETTERS: Record<
  SortKey,
  (row: CollectionsGridRow) => string | number | null | undefined
> = {
  consultantCode: (r) => r.consultantCode,
  consultantName: (r) => r.consultantName,
  contractNumber: (r) => r.contractNumber,
  clientName: (r) => r.clientName,
  projectName: (r) => r.projectName,
  currency: (r) => r.currency,
  paymentMethod: (r) => r.paymentMethod,
  paymentChannel: (r) => r.paymentChannel,
  collectionPremium: (r) => r.collectionPremium,
  collectionDay: (r) => r.collectionDay,
  collectionStatus: (r) => r.collectionStatus,
};

export default function CollectionsPage() {
  const { profile, session, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState<CollectionsGridRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<PaymentDialogState | null>(null);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const accessToken = session?.access_token ?? '';

  const reloadGrid = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const result = await getCollectionsGridAction(accessToken, {
        year,
        page,
        pageSize,
      });
      if (!result.ok) {
        toast.error(result.error);
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(result.data.rows);
      setTotal(result.data.total);
    } catch (err) {
      console.error(err);
      toast.error('Error al cargar cobranza.');
    } finally {
      setLoading(false);
    }
  }, [accessToken, year, page, pageSize, toast]);


  useEffect(() => {
    if (!profile || !accessToken) return;
    let cancelled = false;
    setLoading(true);
    void getCollectionsGridAction(accessToken, { year, page, pageSize })
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          toast.error(result.error);
          setRows([]);
          setTotal(0);
          return;
        }
        setRows(result.data.rows);
        setTotal(result.data.total);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        toast.error('Error al cargar cobranza.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile, accessToken, year, page, pageSize, toast]);


  const sortedRows = useMemo(
    () =>
      sortRows(rows, sortKey, sortDir, COLLECTIONS_SORT_GETTERS, {
        collectionPremium: 'number',
        collectionDay: 'number',
      }, (a, b) =>
        (a.contractNumber ?? '').localeCompare(b.contractNumber ?? '', 'es', {
          numeric: true,
        }),
      ),
    [rows, sortKey, sortDir],
  );

  const toggleSort = (key: SortKey) => {
    const next = nextSortState(sortKey, sortDir, key);
    setSortKey(next.key);
    setSortDir(next.dir);
  };

  const handleStatusChange = async (
    contractId: string,
    status: CollectionStatus,
  ) => {
    if (!accessToken) return;
    setSavingRowId(contractId);
    try {
      const result = await updateCollectionStatusAction(accessToken, {
        contractId,
        status,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.contractId === contractId
            ? { ...r, collectionStatus: result.data.collectionStatus }
            : r,
        ),
      );
      toast.success('Estatus actualizado.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el estatus.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handlePaymentChannelSave = async (
    contractId: string,
    paymentChannel: string | null,
  ) => {
    if (!accessToken) return;
    const current = rows.find((r) => r.contractId === contractId)?.paymentChannel ?? null;
    if ((current ?? null) === (paymentChannel ?? null)) return;

    setSavingRowId(contractId);
    try {
      const result = await updatePaymentChannelAction(accessToken, {
        contractId,
        paymentChannel,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.contractId === contractId
            ? { ...r, paymentChannel: result.data.paymentChannel }
            : r,
        ),
      );
      toast.success('Medio de cobro actualizado.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el medio de cobro.');
    } finally {
      setSavingRowId(null);
    }
  };

  const handleProjectNameSave = async (
    contractId: string,
    projectName: string | null,
  ) => {
    if (!accessToken) return;
    const current = rows.find((r) => r.contractId === contractId)?.projectName ?? null;
    if ((current ?? null) === (projectName ?? null)) return;

    setSavingRowId(contractId);
    try {
      const result = await updateProjectNameAction(accessToken, {
        contractId,
        projectName,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setRows((prev) =>
        prev.map((r) =>
          r.contractId === contractId
            ? { ...r, projectName: result.data.projectName }
            : r,
        ),
      );
      toast.success('Nombre de proyecto actualizado.');
    } catch (err) {
      console.error(err);
      toast.error('No se pudo actualizar el nombre del proyecto.');
    } finally {
      setSavingRowId(null);
    }
  };

  if (authLoading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando...</p>
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h1 className="dashboard-page-title text-4xl font-bold mb-2">Cobranza</h1>
        <p className="text-[#9ca3af] mt-1">
          Pólizas, clientes y fechas con pagos por vencer y monto a cobrar
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <p className="text-[#9ca3af]">Cargando cobranza...</p>
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-[#2a2f38] bg-[#242830] p-8 text-center">
          <p className="text-[#9ca3af]">
            No hay contratos activos para mostrar en cobranza.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-[#2a2f38] bg-[#242830] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[#2a2f38] text-sm">
              <thead className="bg-[#2a2f38]">
                <tr>
                  {(
                    [
                      { label: 'Clave', sort: 'consultantCode' as const },
                      { label: 'Asesor', sort: 'consultantName' as const },
                      { label: 'Póliza', sort: 'contractNumber' as const },
                      { label: 'Nombre cliente (contratante)', sort: 'clientName' as const },
                      { label: 'Nombre proyecto', sort: 'projectName' as const },
                      { label: 'Moneda', sort: 'currency' as const },
                      { label: 'Forma de pago', sort: 'paymentMethod' as const },
                      { label: 'Medio de cobro', sort: 'paymentChannel' as const },
                      { label: 'Prima al cobro', sort: 'collectionPremium' as const },
                      { label: 'Día de cobro', sort: 'collectionDay' as const },
                      { label: 'Estatus', sort: 'collectionStatus' as const },
                      ...MONTH_COLUMNS.map((m) => ({ label: m.label })),
                    ] as Array<{ label: string; sort?: SortKey }>
                  ).map((col) =>
                    col.sort ? (
                      <SortableTh
                        key={col.label}
                        label={col.label}
                        active={sortKey === col.sort}
                        dir={sortDir}
                        onSort={() => toggleSort(col.sort!)}
                        className="text-[#9ca3af]"
                      />
                    ) : (
                      <th
                        key={col.label}
                        className="px-3 py-3 text-left text-xs font-medium text-[#9ca3af] uppercase tracking-wider whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2a2f38]">
                {sortedRows.map((row) => {
                  const saving = savingRowId === row.contractId;
                  return (
                    <tr
                      key={row.contractId}
                      aria-busy={saving || undefined}
                      className={`relative hover:bg-[#2a2f38]/50  ${saving ? 'pointer-events-none' : ''}`}
                    >
                      {saving && (
                        <td
                          colSpan={GRID_COLUMN_COUNT}
                          className="absolute inset-0 z-20 border-0 p-0"
                        >
                          <div className="flex h-full min-h-[2.75rem] w-full items-center justify-center gap-2 bg-[#1a1d23]/75">
                            <span
                              className="inline-block size-4 rounded-full border-2 border-[#FBDBAC] border-t-transparent animate-spin"
                              aria-hidden
                            />
                            <span className="text-xs font-medium text-[#FBDBAC]">
                              Guardando…
                            </span>
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap text-[#e5e7eb]">
                        {row.consultantCode || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {row.consultantId ? (
                          <Link
                            href={`/dashboard/consultants/${row.consultantId}`}
                            className="text-[#FBDBAC] hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {row.consultantName || '—'}
                          </Link>
                        ) : (
                          <span className="text-white">{row.consultantName || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <Link
                          href={`/dashboard/contracts/${row.contractId}`}
                          className="text-[#FBDBAC] hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {row.contractNumber || '—'}
                        </Link>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-white">
                        {row.clientName || '—'}
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ProjectNameInput
                          key={`${row.contractId}:project:${row.projectName ?? ''}`}
                          contractId={row.contractId}
                          value={row.projectName}
                          disabled={saving}
                          onSave={handleProjectNameSave}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#9ca3af]">
                        {row.currency || '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-[#9ca3af]">
                        {row.paymentMethod || '—'}
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <PaymentChannelInput
                          key={`${row.contractId}:${row.paymentChannel ?? ''}`}
                          contractId={row.contractId}
                          value={row.paymentChannel}
                          disabled={saving}
                          onSave={handlePaymentChannelSave}
                        />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right text-white">
                        {row.collectionPremium != null
                          ? Number(row.collectionPremium).toLocaleString('es-MX', {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          : '—'}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-center text-white">
                        {row.collectionDay ?? '—'}
                      </td>
                      <td
                        className="px-3 py-2 whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <select
                          aria-label={`Estatus de cobranza ${row.contractNumber || ''}`}
                          value={row.collectionStatus ?? ''}
                          disabled={saving}
                          onChange={(e) => {
                            const value = e.target.value as CollectionStatus;
                            if (value) handleStatusChange(row.contractId, value);
                          }}
                          className="min-w-[9.5rem] rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#FBDBAC] disabled:opacity-50"
                        >
                          <option value="">—</option>
                          {COLLECTION_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {MONTH_COLUMNS.map(({ month }) => {
                        const cell = row.months[month - 1];
                        const displayDay =
                          cell.scheduledDay ??
                          (!cell.paidAt ? row.collectionDay : null);
                        const paid = Boolean(cell.paidAt);
                        const hasEvidence = Boolean(cell.evidenceFileId);
                        return (
                          <td
                            key={month}
                            className="px-1 py-2 text-center"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              aria-label={`Mes ${month}${paid ? ', pagado' : ''}${hasEvidence ? ', con evidencia' : ''}`}
                              disabled={saving}
                              onClick={() => setDialog({ row, month, cell })}
                              className={`min-w-[2.25rem] rounded px-1.5 py-1 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-[#FBDBAC] disabled:opacity-50 inline-flex items-center justify-center gap-0.5 ${
                                paid
                                  ? 'bg-[#FBDBAC]/20 text-[#FBDBAC] border border-[#FBDBAC]/50'
                                  : 'bg-[#1a1d23] text-[#9ca3af] border border-[#3a4049] hover:border-[#FBDBAC]/40'
                              }`}
                            >
                              {displayDay ?? '·'}
                              {hasEvidence && (
                                <Paperclip
                                  className="size-3 opacity-80"
                                  aria-hidden
                                />
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={total}
            disabled={loading}
            onPageChange={(next) => {
              setLoading(true);
              setPage(next);
            }}
            onPageSizeChange={(size) => {
              setLoading(true);
              setPageSize(size);
              setPage(1);
            }}
          />
        </div>
      )}

      {dialog && (
        <PaymentDialog
          year={year}
          state={dialog}
          accessToken={accessToken}
          onClose={() => setDialog(null)}
          onSavingStart={() => setSavingRowId(dialog.row.contractId)}
          onSavingEnd={() => setSavingRowId(null)}
          onSaved={async () => {
            setDialog(null);
            setSavingRowId(null);
            await reloadGrid();
          }}
        />
      )}
    </div>
  );
}

function EditableConfirmInput({
  label,
  value,
  disabled,
  maxLength,
  inputClassName,
  onConfirm,
}: {
  label: string;
  value: string | null;
  disabled?: boolean;
  maxLength: number;
  inputClassName?: string;
  onConfirm: (next: string | null) => void | Promise<void>;
}) {
  const original = value ?? '';
  const [local, setLocal] = useState(original);
  const dirty = local !== original;

  const confirm = () => {
    if (!dirty || disabled) return;
    const next = local.trim() === '' ? null : local.trim();
    void onConfirm(next);
  };

  const cancel = () => {
    setLocal(original);
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        aria-label={label}
        value={local}
        disabled={disabled}
        maxLength={maxLength}
        placeholder="—"
        onChange={(e) => setLocal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            confirm();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className={inputClassName}
      />
      {dirty && (
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            aria-label={`Confirmar ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              confirm();
            }}
            className="text-[#FBDBAC] hover:text-[#FBDBAC] hover:bg-[#FBDBAC]/10"
          >
            <Check aria-hidden />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            disabled={disabled}
            aria-label={`Cancelar cambios de ${label}`}
            onClick={(e) => {
              e.stopPropagation();
              cancel();
            }}
            className="text-[#9ca3af] hover:text-white hover:bg-[#3a4049]"
          >
            <X aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}

function PaymentChannelInput({
  contractId,
  value,
  disabled,
  onSave,
}: {
  contractId: string;
  value: string | null;
  disabled?: boolean;
  onSave: (contractId: string, paymentChannel: string | null) => Promise<void>;
}) {
  return (
    <EditableConfirmInput
      label="Medio de cobro"
      value={value}
      disabled={disabled}
      maxLength={64}
      inputClassName="h-8 min-w-[5.5rem] max-w-[8rem] bg-[#1a1d23] text-xs"
      onConfirm={(next) => onSave(contractId, next)}
    />
  );
}

function ProjectNameInput({
  contractId,
  value,
  disabled,
  onSave,
}: {
  contractId: string;
  value: string | null;
  disabled?: boolean;
  onSave: (contractId: string, projectName: string | null) => Promise<void>;
}) {
  const current = value ?? '';
  const known = new Set<string>(PROJECT_NAME_OPTIONS);
  const showLegacyOption = Boolean(current && !known.has(current));

  return (
    <select
      aria-label="Nombre proyecto"
      value={current}
      disabled={disabled}
      onChange={(e) => {
        const next = e.target.value.trim() === '' ? null : e.target.value.trim();
        if ((value ?? null) === next) return;
        void onSave(contractId, next);
      }}
      className="h-8 min-w-[10rem] max-w-[16rem] rounded-md border border-[#3a4049] bg-[#1a1d23] text-white px-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#FBDBAC] disabled:opacity-50"
    >
      <option value="">Selecciona un proyecto</option>
      {showLegacyOption && <option value={current}>{current}</option>}
      {PROJECT_NAME_OPTIONS.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}

function PaymentDialog({
  year,
  state,
  accessToken,
  onClose,
  onSaved,
  onSavingStart,
  onSavingEnd,
}: {
  year: number;
  state: PaymentDialogState;
  accessToken: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSavingStart: () => void;
  onSavingEnd: () => void;
}) {
  const { toast } = useToast();
  const { row, month, cell } = state;
  const monthLabel =
    MONTH_COLUMNS.find((m) => m.month === month)?.label ?? String(month);

  const [paidAt, setPaidAt] = useState(cell.paidAt ?? '');
  const [scheduledDay, setScheduledDay] = useState(
    String(cell.scheduledDay ?? row.collectionDay ?? ''),
  );
  const [amount, setAmount] = useState(
    cell.amount != null ? String(cell.amount) : '',
  );
  const [notes, setNotes] = useState(cell.notes ?? '');
  const [evidenceFile, setEvidenceFile] = useState<globalThis.File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [openingEvidence, setOpeningEvidence] = useState(false);

  const isNewMark = !cell.paidAt;
  const hasExistingEvidence = Boolean(cell.evidenceFileId);
  const needsEvidence = isNewMark && !hasExistingEvidence;
  const canSubmit =
    paidAt.trim().length === 10 &&
    !submitting &&
    (!needsEvidence || evidenceFile != null);

  const handleOpenEvidence = async () => {
    if (!cell.evidenceFileId) return;
    setOpeningEvidence(true);
    try {
      const url = await getDocumentSignedUrl(cell.evidenceFileId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      console.error(err);
      toast.error(
        err instanceof Error
          ? err.message
          : 'No se pudo abrir la evidencia.',
      );
    } finally {
      setOpeningEvidence(false);
    }
  };

  const handleSave = async () => {
    setFieldErrors({});
    if (needsEvidence && !evidenceFile) {
      setFieldErrors({
        evidence: 'Adjunta una foto o PDF como evidencia del pago.',
      });
      return;
    }
    if (evidenceFile) {
      if (evidenceFile.size <= 0 || evidenceFile.size > LIMITS.documentFileBytes) {
        setFieldErrors({
          evidence: 'El archivo supera el tamaño máximo permitido (20 MB).',
        });
        return;
      }
      if (
        !DOCUMENT_ALLOWED_MIME_TYPES.includes(
          evidenceFile.type as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number],
        )
      ) {
        setFieldErrors({
          evidence: `Tipos permitidos: imagen, PDF u Office.`,
        });
        return;
      }
    }

    setSubmitting(true);
    onSavingStart();
    try {
      const result = await upsertCollectionPaymentAction(accessToken, {
        contractId: row.contractId,
        year,
        month,
        paidAt,
        scheduledDay: scheduledDay ? Number(scheduledDay) : null,
        amount: amount.trim() === '' ? null : Number(amount),
        notes,
      });
      if (!result.ok) {
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
        toast.error(result.error);
        onSavingEnd();
        return;
      }

      if (evidenceFile && result.data?.id) {
        const upload = await uploadPaymentEvidence({
          contractId: row.contractId,
          collectionPaymentId: result.data.id,
          file: evidenceFile,
          displayName: `Evidencia ${monthLabel} ${year}`,
        });
        if (!upload.ok) {
          toast.error(
            `Pago guardado, pero la evidencia falló: ${upload.error}`,
          );
          await onSaved();
          return;
        }
      }

      toast.success(
        evidenceFile || hasExistingEvidence
          ? 'Pago y evidencia registrados.'
          : 'Pago registrado.',
      );
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo guardar el pago.');
      onSavingEnd();
    } finally {
      setSubmitting(false);
    }
  };

  const handleClear = async () => {
    setSubmitting(true);
    onSavingStart();
    try {
      const result = await clearCollectionPaymentAction(accessToken, {
        contractId: row.contractId,
        year,
        month,
      });
      if (!result.ok) {
        toast.error(result.error);
        onSavingEnd();
        return;
      }
      toast.success('Pago quitado.');
      await onSaved();
    } catch (err) {
      console.error(err);
      toast.error('No se pudo quitar el pago.');
      onSavingEnd();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppDialog
      open
      title={`Pago · ${monthLabel} ${year}`}
      description={`${row.contractNumber || 'Sin póliza'} · ${row.clientName || 'Sin cliente'}`}
      onClose={onClose}
      busy={submitting}
      size="md"
    >
      <div className="space-y-4">
        <FormField label="Fecha real de pago *" htmlFor="paid_at" variant="auth" error={fieldErrors.paidAt}>
          <Input
            id="paid_at"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            required
            className="h-9"
          />
        </FormField>

        <FormField
          label="Día de cobro (calendario)"
          htmlFor="scheduled_day"
          variant="auth"
          error={fieldErrors.scheduledDay}
          hint="Día que se muestra en la celda del mes"
        >
          <Input
            id="scheduled_day"
            type="number"
            inputMode="numeric"
            min={1}
            max={31}
            value={scheduledDay}
            onChange={(e) => setScheduledDay(e.target.value)}
            className="h-9"
          />
        </FormField>

        <FormField label="Monto (opcional)" htmlFor="amount" variant="auth" error={fieldErrors.amount}>
          <Input
            id="amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-9"
          />
        </FormField>

        <FormField
          label="Notas (opcional)"
          htmlFor="notes"
          variant="auth"
          error={fieldErrors.notes}
          hint={`Máximo ${LIMITS.notes} caracteres`}
        >
          <Textarea
            id="notes"
            value={notes}
            maxLength={LIMITS.notes}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="bg-[#1a1d23]"
          />
        </FormField>

        <FormField
          label={needsEvidence ? 'Evidencia de pago *' : 'Evidencia de pago'}
          htmlFor="payment_evidence"
          variant="auth"
          error={fieldErrors.evidence}
          hint="Imagen o PDF (máx. 20 MB). Obligatorio al marcar un mes nuevo."
        >
          <Input
            id="payment_evidence"
            type="file"
            accept={DOCUMENT_ALLOWED_MIME_TYPES.join(',')}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setEvidenceFile(file);
              if (file) {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.evidence;
                  return next;
                });
              }
            }}
            className="h-9"
          />
        </FormField>

        {hasExistingEvidence && (
          <div className="flex items-center justify-between gap-2 rounded-md border border-white/10 px-3 py-2">
            <p className="text-sm text-[#9ca3af] truncate">
              {cell.evidenceDisplayName || 'Evidencia adjunta'}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={openingEvidence || submitting}
              onClick={handleOpenEvidence}
              className="shrink-0 text-[#FBDBAC]"
            >
              {openingEvidence ? 'Abriendo…' : 'Ver evidencia'}
            </Button>
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {cell.paidAt && (
            <Button
              type="button"
              variant="destructive"
              size="lg"
              disabled={submitting}
              onClick={handleClear}
            >
              Quitar pago
            </Button>
          )}
          <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={!canSubmit}
            onClick={handleSave}
          >
            {submitting ? 'Guardando…' : 'Guardar pago'}
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}
