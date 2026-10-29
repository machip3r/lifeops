'use client';

import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  CalendarClock,
  CalendarCheck2,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FilePen,
  FilePlus2,
  FileSpreadsheet,
  FileUp,
  FileX2,
  Gem,
  RefreshCw,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { applyRegistryImportAction, previewRegistryImportAction } from '@/app/dashboard/extractor/registry-actions';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { DiffReview, FilledFieldsSummary } from '@/components/extractor/diff-review';
import { ImportProgressCard, ImportProgressOverlay, type ImportStage } from '@/components/extractor/import-progress';
import { ImportStepper, type ImportStep } from '@/components/extractor/import-stepper';
import { useQueryEffect } from '@/hooks/use-query-effect';
import { parseRegistryFile } from '@/lib/extractor/registry/parse-file';
import type { RegistryField, RegistryRow, RegistrySource } from '@/lib/extractor/registry/fields';
import type { RegistryApplyResult, RegistryPreviewItem } from '@/lib/extractor/registry/import-registry';
import { formatEtaSeconds } from '@/lib/extractor/import-progress';
import { chunkArray } from '@/lib/extractor/batch';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { registryRowSchema } from '@/lib/validation/schemas';
import { cn } from '@/lib/utils';

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

const fmt = (n: number) => n.toLocaleString('es-MX');
const polizas = (n: number) => `${fmt(n)} ${n === 1 ? 'póliza' : 'pólizas'}`;

function fileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PREVIEW_BATCH = 200;
const APPLY_BATCH = 100;

const SOURCE_LABEL: Record<RegistrySource, string> = {
  mina_de_oro: 'Mina de Oro',
  template: 'Plantilla de LifeOps',
};

/** «Importando tu …» / «Leyendo tu …» */
const SOURCE_NOUN: Record<RegistrySource, string> = {
  mina_de_oro: 'tu Mina de Oro',
  template: 'tu plantilla',
};

const STEPS: ImportStep[] = [
  { label: 'Archivo', icon: FileUp },
  { label: 'Revisión', icon: FilePen },
  { label: 'Resultado', icon: ClipboardCheck },
];

type Phase = 'reading' | 'review' | 'importing' | 'done' | 'failed';
type RowError = { row: number; error: string };
type ReadProgress = { stage: 'parse' | 'compare'; rows: number; valid: number; invalid: number; compared: number };
type ApplyProgress = { done: number; total: number; created: number; updated: number; etaSeconds: number | null };

/** Collapsible list of row problems / warnings. */
function RowIssues({ errors, title, tone = 'error' }: { errors: RowError[]; title: string; tone?: 'error' | 'warning' }) {
  if (errors.length === 0) return null;
  return (
    <details className="group rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) px-4 py-3 text-sm sm:px-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-(--lifeops-fg)">
        <AlertTriangle
          className={cn('h-4 w-4 shrink-0', tone === 'error' ? 'text-red-500' : 'text-(--viz-overdue)')}
          aria-hidden
        />
        {title} <span className="font-normal text-(--lifeops-muted)">({fmt(errors.length)})</span>
        <span className="ml-auto text-xs font-normal text-(--lifeops-accent) group-open:hidden">Ver detalle</span>
        <span className="ml-auto hidden text-xs font-normal text-(--lifeops-accent) group-open:inline">Ocultar</span>
      </summary>
      <ul className="mt-3 max-h-56 space-y-1 overflow-y-auto text-xs text-(--lifeops-muted)">
        {errors.slice(0, 200).map((e, i) => (
          <li key={i}>
            {e.row > 0 ? <span className="text-(--lifeops-fg)">Fila {e.row}: </span> : null}
            {e.error}
          </li>
        ))}
        {errors.length > 200 ? <li>… y {fmt(errors.length - 200)} más</li> : null}
      </ul>
    </details>
  );
}

/** Notice row (asesores nuevos, clave de promotoría, corte de la Mina de Oro). */
function Notice({
  icon: Icon,
  tone = 'info',
  children,
  action,
}: {
  icon: LucideIcon;
  tone?: 'info' | 'warning' | 'reminder';
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === 'warning' ? 'alert' : undefined}
      className={cn(
        'flex flex-col gap-3 rounded-xl border px-4 py-3 text-sm text-(--lifeops-fg) sm:flex-row sm:items-center sm:px-5',
        tone === 'warning' && 'border-(--viz-overdue)/50 bg-(--viz-overdue)/10',
        tone === 'reminder' && 'border-(--viz-due-soon)/50 bg-(--viz-due-soon)/10',
        tone === 'info' && 'border-(--lifeops-border) bg-(--lifeops-hover)/40',
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Icon
          className={cn(
            'mt-0.5 h-4 w-4 shrink-0',
            tone === 'warning' ? 'text-(--viz-overdue)' : tone === 'reminder' ? 'text-(--viz-due-soon)' : 'text-(--lifeops-accent)',
          )}
          aria-hidden
        />
        <div className="min-w-0">{children}</div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Registry import (Mina de Oro / plantilla) as a 3-step flow: read the file → review against
 * LifeOps and pick differences → import (blocking overlay) → result.
 * Differences keep LifeOps unless the user picks the file value.
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
  /** Mina de Oro older than today: go upload the commission files from `fromDate` (day after the cut-off) */
  onUploadCommissions?: (fromDate: string) => void;
}) {
  const router = useRouter();
  const { session, profile } = useAuth();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>('reading');
  const [readProgress, setReadProgress] = useState<ReadProgress>({ stage: 'parse', rows: 0, valid: 0, invalid: 0, compared: 0 });
  const [failure, setFailure] = useState('');
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [fileErrors, setFileErrors] = useState<RowError[]>([]);
  const [reportDate, setReportDate] = useState<string | null>(null);
  /** Insurer «en vigor» date sent with the import: Mina de Oro cut-off, else the import day */
  const [asOf, setAsOf] = useState<string | null>(null);
  const [items, setItems] = useState<RegistryPreviewItem[]>([]);
  const [missingConsultants, setMissingConsultants] = useState<Array<{ code: string; name: string | null }>>([]);
  const [picks, setPicks] = useState<Record<string, RegistryField[]>>({});
  const [progress, setProgress] = useState<ApplyProgress>({ done: 0, total: 0, created: 0, updated: 0, etaSeconds: null });
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
      const fileAsOf = source === 'mina_de_oro' && parsed.reportDate && parsed.reportDate <= todayIso() ? parsed.reportDate : todayIso();
      setReadProgress({ stage: 'compare', rows: parsed.rows.length, valid: valid.length, invalid: errors.length, compared: 0 });

      const previewItems: RegistryPreviewItem[] = [];
      const missing = new Map<string, { code: string; name: string | null }>();
      for (const batch of chunkArray(valid, PREVIEW_BATCH)) {
        const preview = await previewRegistryImportAction(token, { source, rows: batch, asOf: fileAsOf });
        if (!preview.ok) throw new Error(preview.error);
        previewItems.push(...preview.items);
        for (const m of preview.missingConsultants) missing.set(m.code.toLowerCase(), m);
        setReadProgress((p) => ({ ...p, compared: p.compared + batch.length }));
      }
      setRows(valid);
      setFileErrors(errors);
      setReportDate(parsed.reportDate);
      setAsOf(fileAsOf);
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
      confirms: items.filter((i) => i.confirmsInForce).length,
    }),
    [items],
  );
  const changed = useMemo(() => items.filter((i) => i.kind === 'changed'), [items]);
  const filledItems = useMemo(
    () => items.filter((i) => i.fills.length > 0).map((i) => ({ key: i.contractNumber, fills: i.fills })),
    [items],
  );
  const foreignAgencies = officeAgency ? fileAgencies.filter((code) => !sameAgencyCode(code, officeAgency)) : [];
  const staleCutoff = source === 'mina_de_oro' && reportDate != null && reportDate < todayIso();
  const pickedCount = Object.values(picks).reduce((n, fields) => n + fields.length, 0);
  const pickedPolizas = Object.values(picks).filter((fields) => fields.length > 0).length;
  const toImport = counts.new + counts.filled + pickedCount + counts.confirms;

  const runImport = async () => {
    const token = session?.access_token;
    if (!token) {
      toast.error('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    setPhase('importing');
    const total: RegistryApplyResult = { created: 0, updated: 0, unchanged: 0, confirmed: 0, errors: [], warnings: [] };
    const batches = chunkArray(rows, APPLY_BATCH);
    const started = performance.now();
    let done = 0;
    setProgress({ done: 0, total: rows.length, created: 0, updated: 0, etaSeconds: null });
    for (const batch of batches) {
      const updates = Object.fromEntries(batch.filter((r) => picks[r.contractNumber]?.length).map((r) => [r.contractNumber, picks[r.contractNumber]]));
      let applied: Awaited<ReturnType<typeof applyRegistryImportAction>> | null = null;
      for (let attempt = 0; attempt < 3 && !applied?.ok; attempt++) {
        try {
          applied = await applyRegistryImportAction(token, { source, rows: batch, updates, asOf });
        } catch (error) {
          console.error('registry batch failed', error);
        }
      }
      if (applied?.ok) {
        total.created += applied.created;
        total.updated += applied.updated;
        total.unchanged += applied.unchanged;
        total.confirmed += applied.confirmed;
        total.errors.push(...applied.errors);
        total.warnings.push(...applied.warnings);
      } else {
        total.errors.push({
          row: batch[0]?.index ?? 0,
          error: (applied && !applied.ok && applied.error) || `No se pudieron importar ${batch.length} pólizas (filas ${batch[0]?.index}–${batch.at(-1)?.index}).`,
        });
      }
      done += batch.length;
      const elapsed = (performance.now() - started) / 1000;
      setProgress({
        done,
        total: rows.length,
        created: total.created,
        updated: total.updated,
        etaSeconds: done < rows.length ? (elapsed / done) * (rows.length - done) : 0,
      });
    }
    setResult(total);
    setPhase('done');
    if (total.created + total.updated + total.confirmed > 0) onFinished?.(total);
  };

  const SourceIcon = source === 'mina_de_oro' ? Gem : FileSpreadsheet;
  const header = (
    <div className="flex flex-col gap-3 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
      <div className="flex min-w-0 gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
          <SourceIcon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-(--lifeops-accent)">{SOURCE_LABEL[source]}</p>
          <h2 className="truncate text-[15px] font-semibold text-(--lifeops-fg)">{file.name}</h2>
          <p className="text-xs text-(--lifeops-muted)">
            {fileSize(file.size)}
            {reportDate ? ` · corte al ${formatDateShortEsLocal(reportDate)}` : ''}
            {rows.length > 0 ? ` · ${polizas(rows.length)}` : ''}
          </p>
        </div>
      </div>
      {phase === 'review' || phase === 'failed' || phase === 'reading' ? (
        <Button type="button" variant="outline" onClick={onExit} className="gap-2 self-start sm:self-auto">
          <RefreshCw className="h-4 w-4" aria-hidden />
          {phase === 'reading' ? 'Cancelar' : 'Elegir otro archivo'}
        </Button>
      ) : null}
    </div>
  );

  const stepper = (
    <ImportStepper
      steps={STEPS}
      current={phase === 'reading' || phase === 'failed' ? 1 : phase === 'review' ? 2 : 3}
      complete={phase === 'done'}
      onSelect={phase === 'review' ? () => onExit() : undefined}
    />
  );

  if (phase === 'reading') {
    const comparing = readProgress.stage === 'compare';
    const stages: ImportStage[] = [
      {
        label: 'Leer el archivo',
        state: comparing ? 'done' : 'active',
        detail: comparing ? `${fmt(readProgress.rows)} filas encontradas` : 'Abriendo el Excel y buscando las columnas…',
      },
      {
        label: 'Revisar cada fila',
        state: comparing ? 'done' : 'pending',
        detail: comparing
          ? `${polizas(readProgress.valid)} listas${readProgress.invalid ? ` · ${fmt(readProgress.invalid)} con problemas` : ''}`
          : undefined,
      },
      {
        label: 'Comparar con LifeOps',
        state: comparing ? 'active' : 'pending',
        detail: comparing ? `${fmt(readProgress.compared)} de ${polizas(readProgress.valid)}` : 'Qué pólizas son nuevas y qué datos cambian',
      },
    ];
    return (
      <div className="space-y-4">
        {stepper}
        {header}
        <ImportProgressCard
          title={`Leyendo ${SOURCE_NOUN[source]}`}
          message="Todavía no se guarda nada: primero vas a revisar qué cambia en LifeOps."
          percent={comparing && readProgress.valid ? 10 + (90 * readProgress.compared) / readProgress.valid : null}
          countLabel={comparing ? `${fmt(readProgress.compared)} de ${polizas(readProgress.valid)} comparadas` : undefined}
          stages={stages}
        />
      </div>
    );
  }

  if (phase === 'failed') {
    return (
      <div className="space-y-4">
        {stepper}
        {header}
        <div role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 p-5">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-(--lifeops-fg)">
            <AlertTriangle className="h-5 w-5 shrink-0 text-red-500" aria-hidden />
            No pudimos leer el archivo
          </p>
          <p className="mt-1 text-sm text-(--lifeops-fg)">{failure}</p>
          <p className="mt-1 text-sm text-(--lifeops-muted)">
            Revisa que sea {source === 'mina_de_oro' ? 'la Mina de Oro de Seguros Monterrey' : 'la plantilla de LifeOps'} en Excel (.xlsx) o CSV
            e inténtalo de nuevo.
          </p>
          <Button type="button" variant="brand" onClick={onExit} className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" aria-hidden />
            Elegir otro archivo
          </Button>
        </div>
        <RowIssues errors={fileErrors} title="Filas con problemas" />
      </div>
    );
  }

  if (phase === 'done' && result) {
    const notImported = fileErrors.length + result.errors.length;
    const saved = result.created + result.updated + result.confirmed;
    const tone = saved === 0 && notImported > 0 ? 'failed' : notImported > 0 ? 'partial' : 'ok';
    return (
      <div className="space-y-4">
        {stepper}
        <section className="overflow-hidden rounded-2xl border border-(--lifeops-border) bg-(--lifeops-chrome) animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="flex flex-col items-center gap-3 border-b border-(--lifeops-border) bg-[#FBDBAC]/[0.07] px-5 py-8 text-center sm:px-8">
            <span
              className={cn(
                'flex h-14 w-14 items-center justify-center rounded-full',
                tone === 'failed' ? 'bg-red-500/15 text-red-500' : 'bg-[#FBDBAC]/20 text-(--lifeops-accent)',
              )}
            >
              {tone === 'failed' ? (
                <AlertTriangle className="h-7 w-7" aria-hidden />
              ) : (
                <CheckCircle2 className="h-7 w-7" aria-hidden />
              )}
            </span>
            <div>
              <h2 className="text-xl font-semibold text-(--lifeops-fg)">
                {tone === 'failed'
                  ? 'No se importó ninguna póliza'
                  : tone === 'partial'
                    ? 'Importación terminada, con pendientes'
                    : 'Tu cartera quedó cargada'}
              </h2>
              <p className="mx-auto mt-1 max-w-xl text-sm text-(--lifeops-muted)">
                {tone === 'failed'
                  ? 'Revisa el detalle de abajo, corrige el archivo e inténtalo de nuevo.'
                  : `${polizas(saved)} de ${SOURCE_NOUN[source]} ya están en LifeOps.${
                      notImported > 0 ? ` ${polizas(notImported)} no se pudieron importar; revisa el detalle abajo.` : ''
                    }`}
              </p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {doneActions ?? (
                <>
                  <Button type="button" variant="brand" size="lg" onClick={() => router.push('/dashboard/contracts')}>
                    Ver pólizas
                  </Button>
                  <Button type="button" variant="outline" size="lg" onClick={onExit}>
                    Importar otro archivo
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4 sm:p-5 xl:grid-cols-4">
            <StatTile label="Pólizas nuevas" icon={FilePlus2} value={fmt(result.created)} detail="Registradas en LifeOps" />
            <StatTile label="Actualizadas" icon={FilePen} value={fmt(result.updated)} detail="Datos completados o cambiados" />
            <StatTile label="Sin cambios" icon={FileCheck2} value={fmt(result.unchanged)} detail="Ya estaban al día" />
            <StatTile label="No importadas" icon={FileX2} value={fmt(notImported)} detail={notImported ? 'Revisa el detalle abajo' : 'Ninguna'} />
          </div>
        </section>

        {result.confirmed > 0 && asOf ? (
          <Notice icon={CalendarCheck2}>
            <span className="font-medium">
              {polizas(result.confirmed)} en vigor {result.confirmed === 1 ? 'quedó' : 'quedaron'} al día según la aseguradora al{' '}
              {formatDateShortEsLocal(asOf)}.
            </span>{' '}
            <span className="text-(--lifeops-muted)">Cobranza, gráficas y listas cuentan sus recibos hasta esa fecha como pagados.</span>
          </Notice>
        ) : null}

        {missingConsultants.length > 0 ? (
          <Notice
            icon={UserPlus}
            action={
              doneActions ? null : (
                <Button type="button" variant="outline" size="sm" onClick={() => router.push('/dashboard/consultants')}>
                  Ver asesores
                </Button>
              )
            }
          >
            <span className="font-medium">
              {missingConsultants.length === 1 ? 'Se creó 1 asesor' : `Se crearon ${fmt(missingConsultants.length)} asesores`} «Sin invitar».
            </span>{' '}
            <span className="text-(--lifeops-muted)">Invítalos desde Asesores cuando quieras que entren a LifeOps.</span>
          </Notice>
        ) : null}

        {staleCutoff && reportDate ? (
          <Notice
            icon={CalendarClock}
            tone="reminder"
            action={
              onUploadCommissions ? (
                <Button type="button" variant="brand" size="sm" onClick={() => onUploadCommissions(dayAfter(reportDate))}>
                  Subir archivos de comisiones
                </Button>
              ) : null
            }
          >
            <span className="font-medium">Tu Mina de Oro tiene corte al {formatDateShortEsLocal(reportDate)}.</span>{' '}
            <span className="text-(--lifeops-muted)">
              Para que los pagos estén al día, sube también los archivos de comisiones del {formatDateShortEsLocal(dayAfter(reportDate))} a hoy.
              Es opcional, pero te lo recomendamos.
            </span>
          </Notice>
        ) : null}

        <RowIssues errors={[...fileErrors, ...result.errors]} title="Pólizas que no se importaron" />
        <RowIssues errors={result.warnings.map((w) => ({ row: w.row, error: w.message }))} title="Avisos" tone="warning" />
      </div>
    );
  }

  // Review (also the backdrop of the importing overlay)
  const importing = phase === 'importing';
  const applyPct = progress.total ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="space-y-4">
      {stepper}
      {header}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="Pólizas nuevas" icon={FilePlus2} value={fmt(counts.new)} detail="Se registran en LifeOps" />
        <StatTile label="Datos por completar" icon={CalendarCheck2} value={fmt(counts.filled)} detail="Campos vacíos en LifeOps: se llenan solos" />
        <StatTile label="Con diferencias" icon={FilePen} value={fmt(counts.changed)} detail="Tú decides qué actualizar" />
        <StatTile
          label="Sin cambios / con error"
          icon={FileX2}
          value={`${fmt(counts.same)} / ${fmt(fileErrors.length)}`}
          detail="Iguales a LifeOps / no se pueden leer"
        />
      </div>

      {foreignAgencies.length > 0 ? (
        <Notice icon={AlertTriangle} tone="warning">
          <span className="font-medium">El número de promotoría no coincide.</span> Tu clave en LifeOps es{' '}
          <span className="font-mono">{officeAgency}</span> y el archivo es de la promotoría{' '}
          <span className="font-mono">{foreignAgencies.join(', ')}</span>. Revisa que sea tu Mina de Oro antes de importar.
        </Notice>
      ) : !officeAgency && fileAgencies.length > 0 ? (
        <Notice icon={AlertTriangle}>
          <span className="text-(--lifeops-muted)">
            Este archivo es de la promotoría <span className="font-mono text-(--lifeops-fg)">{fileAgencies.join(', ')}</span>. Tu promotoría
            aún no tiene clave en LifeOps (Perfil).
          </span>
        </Notice>
      ) : null}

      {missingConsultants.length > 0 ? (
        <Notice icon={UserPlus}>
          <span className="font-medium">
            Se {missingConsultants.length === 1 ? 'creará 1 asesor' : `crearán ${fmt(missingConsultants.length)} asesores`} que aún no
            {missingConsultants.length === 1 ? ' está' : ' están'} en LifeOps, como «Sin invitar»:
          </span>{' '}
          <span className="text-(--lifeops-muted)">
            {missingConsultants
              .slice(0, 6)
              .map((c) => c.name || c.code)
              .join(', ')}
            {missingConsultants.length > 6 ? ` y ${fmt(missingConsultants.length - 6)} más` : ''}.
          </span>
        </Notice>
      ) : null}

      {counts.confirms > 0 && asOf ? (
        <Notice icon={CalendarCheck2}>
          <span className="font-medium">
            {polizas(counts.confirms)} en vigor {counts.confirms === 1 ? 'queda' : 'quedan'} al día según{' '}
            {source === 'mina_de_oro' ? `la Mina de Oro al ${formatDateShortEsLocal(asOf)}` : `el archivo (${formatDateShortEsLocal(asOf)})`}.
          </span>{' '}
          <span className="text-(--lifeops-muted)">
            Si la aseguradora la reporta en vigor, sus recibos hasta esa fecha cuentan como pagados aunque no estén registrados en
            LifeOps; cobranza empieza con el siguiente recibo.
          </span>
        </Notice>
      ) : null}

      {changed.length === 0 && counts.new + counts.filled > 0 ? (
        <Notice icon={CheckCircle2}>
          <span className="text-(--lifeops-muted)">
            Ninguna póliza tiene datos distintos a LifeOps: solo se registran las nuevas y se completan los datos vacíos.
          </span>
        </Notice>
      ) : null}

      <FilledFieldsSummary items={filledItems} />

      <DiffReview
        items={changed.map((i) => ({ key: i.contractNumber, subtitle: i.clientName, diffs: i.diffs }))}
        picks={picks}
        onChange={(next) => setPicks(next as Record<string, RegistryField[]>)}
      />

      <RowIssues errors={fileErrors} title="Filas que no se importarán" />

      <div className="sticky bottom-3 z-20 flex flex-col gap-3 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)/95 px-4 py-3 shadow-lg backdrop-blur-sm sm:flex-row sm:items-center">
        <p className="text-sm text-(--lifeops-muted) sm:mr-auto">
          <span className="font-medium text-(--lifeops-fg)">Paso 2 de 3.</span> {fmt(counts.new)} nuevas · {fmt(counts.filled)} por completar ·{' '}
          {pickedCount ? `${fmt(pickedCount)} datos cambiados en ${polizas(pickedPolizas)}` : 'sin cambios elegidos'}
          {counts.confirms ? ` · ${fmt(counts.confirms)} al día según la aseguradora` : ''}
        </p>
        <div className="flex gap-3">
          <Button type="button" variant="outline" size="lg" onClick={onExit} className="flex-1 sm:flex-none">
            Atrás
          </Button>
          <Button
            type="button"
            variant="brand"
            size="lg"
            disabled={toImport === 0 || importing}
            className={cn('flex-1 sm:min-w-40 sm:flex-none', toImport > 0 && 'lifeops-cta-pulse')}
            onClick={() => (foreignAgencies.length > 0 ? setConfirmAgency(true) : void runImport())}
          >
            Importar
          </Button>
        </div>
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

      <ImportProgressOverlay
        open={importing}
        title={`Importando ${SOURCE_NOUN[source]}`}
        message="Registrando pólizas nuevas, completando datos y aplicando los cambios que elegiste."
        percent={applyPct}
        countLabel={`${fmt(progress.done)} de ${polizas(progress.total)}`}
        etaLabel={progress.done > 0 ? `Tiempo restante: ${formatEtaSeconds(progress.etaSeconds)}` : 'Calculando tiempo…'}
        stages={[
          {
            label: 'Guardar pólizas',
            state: progress.done >= progress.total && progress.total > 0 ? 'done' : 'active',
            detail: `${fmt(progress.created)} nuevas · ${fmt(progress.updated)} actualizadas hasta ahora`,
          },
          { label: 'Preparar el resumen', state: 'pending' },
        ]}
      />
    </div>
  );
}
