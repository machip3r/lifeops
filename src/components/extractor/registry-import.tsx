'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarCheck2, CheckCircle2, FilePen, FilePlus2, FileSpreadsheet, FileX2, RefreshCw } from 'lucide-react';
import { applyRegistryImportAction, previewRegistryImportAction } from '@/app/dashboard/extractor/registry-actions';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { DiffReview } from '@/components/extractor/diff-review';
import { Skeleton } from '@/components/ui/skeleton';
import { useQueryEffect } from '@/hooks/use-query-effect';
import { parseRegistryFile } from '@/lib/extractor/registry/parse-file';
import type { RegistryField, RegistryRow, RegistrySource } from '@/lib/extractor/registry/fields';
import type { RegistryApplyResult, RegistryPreviewItem } from '@/lib/extractor/registry/import-registry';
import { chunkArray } from '@/lib/extractor/batch';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { registryRowSchema } from '@/lib/validation/schemas';

/** Same promotoría whether written "P-2852", "2852" or "02852". */
function sameAgencyCode(a: string, b: string): boolean {
  const alnum = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const digits = (v: string) => v.replace(/\D/g, '').replace(/^0+/, '');
  return alnum(a) === alnum(b) || (digits(a) !== '' && digits(a) === digits(b));
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayAfter(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const next = new Date(y, m - 1, d + 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`;
}

const PREVIEW_BATCH = 200;
const APPLY_BATCH = 100;

const SOURCE_LABEL: Record<RegistrySource, string> = {
  mina_de_oro: 'Mina de Oro',
  template: 'Plantilla de LifeOps',
};

type Phase = 'reading' | 'review' | 'importing' | 'done' | 'failed';
type RowError = { row: number; error: string };

/**
 * Registry import (Mina de Oro / plantilla): read → compare with LifeOps → pick differences → import.
 * Differences keep LifeOps unless the user checks "usar el archivo".
 */
export function RegistryImport({
  source,
  file,
  onExit,
  onFinished,
  doneActions,
  onUploadCommissions,
}: {
  source: RegistrySource;
  file: File;
  /** Back to choosing a file */
  onExit: () => void;
  /** After a successful import */
  onFinished?: (result: RegistryApplyResult) => void;
  /** Replaces "Ver pólizas / Importar otro archivo" on the result (onboarding) */
  doneActions?: ReactNode;
  /** Mina de Oro older than today: go upload the commission files after its cut-off */
  onUploadCommissions?: () => void;
}) {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('reading');
  const [failure, setFailure] = useState('');
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [fileErrors, setFileErrors] = useState<RowError[]>([]);
  const [reportDate, setReportDate] = useState<string | null>(null);
  const [items, setItems] = useState<RegistryPreviewItem[]>([]);
  const [missingConsultants, setMissingConsultants] = useState<Array<{ code: string; name: string | null }>>([]);
  const [picks, setPicks] = useState<Record<string, RegistryField[]>>({});
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<RegistryApplyResult | null>(null);
  const [fileAgencies, setFileAgencies] = useState<string[]>([]);
  const [officeAgency, setOfficeAgency] = useState<string | null>(null);
  const [confirmAgency, setConfirmAgency] = useState(false);

  const officeId = profile?.id;
  const read = useCallback(async () => {
    const token = session?.access_token;
    try {
      const [parsed, office] = await Promise.all([
        parseRegistryFile(file, source),
        officeId ? db.office.getOfficeById(officeId).catch(() => null) : Promise.resolve(null),
      ]);
      // Same schema as the server: bad rows are reported here, the rest still imports
      const valid: RegistryRow[] = [];
      const errors: RowError[] = [...parsed.errors];
      for (const row of parsed.rows) {
        const check = registryRowSchema.safeParse(row);
        if (check.success) valid.push(row);
        else errors.push({ row: row.index, error: `Dato no válido en «${String(check.error.issues[0]?.path[0] ?? 'fila')}».` });
      }
      if (valid.length === 0) {
        setFileErrors(errors);
        setFailure(errors.length ? 'Ninguna fila del archivo se puede importar.' : 'El archivo no tiene pólizas.');
        setPhase('failed');
        return;
      }
      if (!token) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.');

      const previewItems: RegistryPreviewItem[] = [];
      const missing = new Map<string, { code: string; name: string | null }>();
      for (const batch of chunkArray(valid, PREVIEW_BATCH)) {
        const preview = await previewRegistryImportAction(token, { source, rows: batch });
        if (!preview.ok) throw new Error(preview.error);
        previewItems.push(...preview.items);
        for (const m of preview.missingConsultants) missing.set(m.code.toLowerCase(), m);
      }
      setRows(valid);
      setFileErrors(errors);
      setReportDate(parsed.reportDate);
      setFileAgencies(parsed.agencyCodes);
      setOfficeAgency(office?.agency_code?.trim() || null);
      setItems(previewItems);
      setMissingConsultants([...missing.values()]);
      setPhase('review');
    } catch (error) {
      console.error('registry read failed', error);
      setFailure(error instanceof Error ? error.message : 'No se pudo leer el archivo.');
      setPhase('failed');
    }
  }, [file, source, session?.access_token, officeId]);

  useQueryEffect(true, read);

  const counts = useMemo(
    () => ({
      new: items.filter((i) => i.kind === 'new').length,
      filled: items.filter((i) => i.kind === 'filled' || (i.kind === 'changed' && i.fills.length > 0)).length,
      changed: items.filter((i) => i.kind === 'changed').length,
      same: items.filter((i) => i.kind === 'same').length,
    }),
    [items],
  );
  const changed = useMemo(() => items.filter((i) => i.kind === 'changed'), [items]);
  const foreignAgencies = officeAgency ? fileAgencies.filter((code) => !sameAgencyCode(code, officeAgency)) : [];
  const staleCutoff = source === 'mina_de_oro' && reportDate != null && reportDate < todayIso();
  const pickedCount = Object.values(picks).reduce((n, fields) => n + fields.length, 0);

  const runImport = async () => {
    const token = session?.access_token;
    if (!token) {
      toast.error('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    setPhase('importing');
    const total: RegistryApplyResult = { created: 0, updated: 0, unchanged: 0, errors: [], warnings: [] };
    const batches = chunkArray(rows, APPLY_BATCH);
    setProgress({ done: 0, total: rows.length });
    for (const batch of batches) {
      const updates = Object.fromEntries(batch.filter((r) => picks[r.contractNumber]?.length).map((r) => [r.contractNumber, picks[r.contractNumber]]));
      let applied: Awaited<ReturnType<typeof applyRegistryImportAction>> | null = null;
      for (let attempt = 0; attempt < 3 && !applied?.ok; attempt++) {
        try {
          applied = await applyRegistryImportAction(token, { source, rows: batch, updates });
        } catch (error) {
          console.error('registry batch failed', error);
        }
      }
      if (applied?.ok) {
        total.created += applied.created;
        total.updated += applied.updated;
        total.unchanged += applied.unchanged;
        total.errors.push(...applied.errors);
        total.warnings.push(...applied.warnings);
      } else {
        total.errors.push({
          row: batch[0]?.index ?? 0,
          error: (applied && !applied.ok && applied.error) || `No se pudieron importar ${batch.length} pólizas (filas ${batch[0]?.index}–${batch.at(-1)?.index}).`,
        });
      }
      setProgress((p) => ({ ...p, done: p.done + batch.length }));
    }
    setResult(total);
    setPhase('done');
    if (total.created + total.updated > 0) onFinished?.(total);
  };

  const header = (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
          <FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold text-(--lifeops-fg)">{file.name}</h2>
          <p className="text-sm text-(--lifeops-muted)">
            {SOURCE_LABEL[source]}
            {reportDate ? ` · reporte del ${formatDateShortEsLocal(reportDate)}` : ''}
            {phase !== 'reading' && rows.length > 0 ? ` · ${rows.length.toLocaleString('es-MX')} pólizas` : ''}
          </p>
        </div>
      </div>
      {phase === 'review' || phase === 'failed' ? (
        <Button type="button" variant="outline" onClick={onExit} className="gap-2">
          <RefreshCw className="h-4 w-4" aria-hidden />
          Elegir otro archivo
        </Button>
      ) : null}
    </div>
  );

  const errorList = (errors: RowError[], title: string) =>
    errors.length > 0 ? (
      <details className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium text-(--lifeops-fg)">
          {title} ({errors.length.toLocaleString('es-MX')})
        </summary>
        <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs text-(--lifeops-muted)">
          {errors.slice(0, 200).map((e, i) => (
            <li key={i}>
              {e.row > 0 ? `Fila ${e.row}: ` : ''}
              {e.error}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  if (phase === 'reading') {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        {header}
        <span className="sr-only">Leyendo y comparando con LifeOps</span>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        {header}
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-(--lifeops-fg)">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" aria-hidden />
          {failure}
        </p>
        {errorList(fileErrors, 'Filas con problemas')}
      </div>
    );
  }

  if (phase === 'importing') {
    const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        {header}
        <div className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5">
          <p className="text-sm font-medium text-(--lifeops-fg)">
            Importando… {progress.done.toLocaleString('es-MX')} de {progress.total.toLocaleString('es-MX')} pólizas
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-(--lifeops-hover)">
            <div className="h-full rounded-full bg-[#FBDBAC] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-(--lifeops-muted)">No cierres esta página hasta que termine.</p>
        </div>
      </div>
    );
  }

  if (phase === 'done' && result) {
    return (
      <div className="space-y-4">
        {header}
        <div className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-(--lifeops-fg)">
            <CheckCircle2 className="h-5 w-5 text-(--viz-current)" aria-hidden />
            Importación terminada
          </p>
          <p className="mt-1 text-sm text-(--lifeops-muted)">
            {result.created.toLocaleString('es-MX')} pólizas nuevas · {result.updated.toLocaleString('es-MX')} actualizadas ·{' '}
            {result.unchanged.toLocaleString('es-MX')} sin cambios
            {missingConsultants.length ? ` · ${missingConsultants.length} asesores creados sin invitar` : ''}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {doneActions ?? (
              <>
                <Button type="button" variant="brand" onClick={() => router.push('/dashboard/contracts')}>
                  Ver pólizas
                </Button>
                <Button type="button" variant="outline" onClick={onExit}>
                  Importar otro archivo
                </Button>
              </>
            )}
          </div>
        </div>
        {staleCutoff && reportDate ? (
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-(--viz-due-soon)/50 bg-(--viz-due-soon)/10 p-4">
            <p className="max-w-2xl text-sm text-(--lifeops-fg)">
              <span className="font-medium">Tu Mina de Oro tiene corte al {formatDateShortEsLocal(reportDate)}.</span> Para que los pagos
              estén al día, sube también los archivos de comisiones del {formatDateShortEsLocal(dayAfter(reportDate))} a hoy. Es
              opcional, pero te lo recomendamos.
            </p>
            {onUploadCommissions ? (
              <Button type="button" variant="outline" onClick={onUploadCommissions}>
                Subir archivos de comisiones
              </Button>
            ) : null}
          </div>
        ) : null}
        {errorList([...fileErrors, ...result.errors], 'Pólizas que no se importaron')}
        {result.warnings.length > 0
          ? errorList(result.warnings.map((w) => ({ row: w.row, error: w.message })), 'Avisos')
          : null}
      </div>
    );
  }

  // Review
  return (
    <div className="space-y-4">
      {header}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Pólizas nuevas" icon={FilePlus2} value={counts.new.toLocaleString('es-MX')} detail="Se registran en LifeOps" />
        <StatTile label="Datos por completar" icon={CalendarCheck2} value={counts.filled.toLocaleString('es-MX')} detail="Campos vacíos en LifeOps: se llenan solos" />
        <StatTile label="Con diferencias" icon={FilePen} value={counts.changed.toLocaleString('es-MX')} detail="Tú decides qué actualizar" />
        <StatTile
          label="Sin cambios / con error"
          icon={FileX2}
          value={`${counts.same.toLocaleString('es-MX')} / ${fileErrors.length.toLocaleString('es-MX')}`}
          detail="Iguales a LifeOps / no se pueden leer"
        />
      </div>

      {foreignAgencies.length > 0 ? (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-(--viz-overdue)/50 bg-(--viz-overdue)/10 px-4 py-3 text-sm text-(--lifeops-fg)">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-(--viz-overdue)" aria-hidden />
          <span>
            <span className="font-medium">El número de promotoría no coincide.</span> Tu clave en LifeOps es{' '}
            <span className="font-mono">{officeAgency}</span> y el archivo es de la promotoría{' '}
            <span className="font-mono">{foreignAgencies.join(', ')}</span>. Revisa que sea tu Mina de Oro antes de importar.
          </span>
        </p>
      ) : !officeAgency && fileAgencies.length > 0 ? (
        <p className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-hover)/40 px-4 py-3 text-sm text-(--lifeops-muted)">
          Este archivo es de la promotoría <span className="font-mono text-(--lifeops-fg)">{fileAgencies.join(', ')}</span>. Tu promotoría aún no tiene clave en LifeOps (Perfil).
        </p>
      ) : null}

      {missingConsultants.length > 0 ? (
        <p className="rounded-lg border border-(--lifeops-border) bg-(--lifeops-hover)/40 px-4 py-3 text-sm text-(--lifeops-fg)">
          Se crearán {missingConsultants.length} asesores que aún no están en LifeOps, como «Sin invitar»:{' '}
          <span className="text-(--lifeops-muted)">
            {missingConsultants
              .slice(0, 6)
              .map((c) => c.name || c.code)
              .join(', ')}
            {missingConsultants.length > 6 ? ` y ${missingConsultants.length - 6} más` : ''}.
          </span>
        </p>
      ) : null}

      <DiffReview
        items={changed.map((i) => ({ key: i.contractNumber, subtitle: i.clientName, diffs: i.diffs }))}
        picks={picks}
        onChange={(next) => setPicks(next as Record<string, RegistryField[]>)}
      />

      {errorList(fileErrors, 'Filas que no se importarán')}

      <div className="flex flex-wrap items-center justify-end gap-3 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3">
        <p className="mr-auto text-sm text-(--lifeops-muted)">
          {counts.new.toLocaleString('es-MX')} nuevas · {counts.filled.toLocaleString('es-MX')} por completar ·{' '}
          {pickedCount.toLocaleString('es-MX')} cambios elegidos
        </p>
        <Button type="button" variant="outline" size="lg" onClick={onExit}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="brand"
          size="lg"
          disabled={counts.new + counts.filled + pickedCount === 0}
          onClick={() => (foreignAgencies.length > 0 ? setConfirmAgency(true) : void runImport())}
        >
          Importar
        </Button>
      </div>

      <ConfirmDialog
        open={confirmAgency}
        title="Son números de promotoría distintos"
        description={`En LifeOps tu clave de promotoría es ${officeAgency ?? ''}, pero la Mina de Oro es de la promotoría ${foreignAgencies.join(', ')}.\n\n¿Seguro que es tu cartera y quieres importarla de todos modos?`}
        confirmVariant="brand"
        confirmLabel="Sí, importar"
        cancelLabel="Revisar el archivo"
        onCancel={() => setConfirmAgency(false)}
        onConfirm={() => {
          setConfirmAgency(false);
          void runImport();
        }}
      />
    </div>
  );
}
