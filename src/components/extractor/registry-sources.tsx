'use client';

import type { ReactNode } from 'react';
import { Download, FileSpreadsheet, Gem } from 'lucide-react';
import { ImportDropzone } from '@/components/extractor/import-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/toast';
import { downloadRegistryTemplate } from '@/lib/extractor/registry/template';
import type { RegistrySource } from '@/lib/extractor/registry/fields';

const ACCEPT = '.xlsx,.csv';

/** "— o —" between import options. */
export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-(--lifeops-muted)" aria-hidden>
      <span className="h-px flex-1 bg-(--lifeops-border)" />o<span className="h-px flex-1 bg-(--lifeops-border)" />
    </div>
  );
}

/** Drop zone for one Excel / CSV file. */
function SpreadsheetDropzone({ label, onFile, disabled }: { label: string; onFile: (file: File) => void; disabled?: boolean }) {
  const { toast } = useToast();
  return (
    <ImportDropzone
      label={label}
      hint="Excel (.xlsx) o CSV"
      accept={ACCEPT}
      disabled={disabled}
      onFiles={([file]) => {
        if (!/\.(xlsx|csv)$/i.test(file.name)) {
          toast.error('Sube un archivo de Excel (.xlsx) o CSV (.csv).');
          return;
        }
        onFile(file);
      }}
    />
  );
}

type SourceHeaderProps = {
  icon: ReactNode;
  title: string;
  description: string;
  /** Top-right of the card (stacks under the title on mobile) */
  actions?: ReactNode;
};

/** Icon, title and subtitle of an Importar source (commissions HTML, Mina de Oro, plantilla). */
export function SourceHeader({ icon, title, description, actions }: SourceHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
          {icon}
        </span>
        <div>
          <h2 className="text-base font-semibold text-(--lifeops-fg)">{title}</h2>
          <p className="mt-0.5 text-sm text-(--lifeops-muted)">{description}</p>
        </div>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

function SourceCard({ children, ...header }: SourceHeaderProps & { children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-4 sm:p-5">
      <SourceHeader {...header} />
      {children}
    </section>
  );
}

/** Mina de Oro (Seguros Monterrey) and the LifeOps plantilla, separated by "o". */
export function RegistrySources({ onPick, disabled }: { onPick: (source: RegistrySource, file: File) => void; disabled?: boolean }) {
  const { toast } = useToast();
  const download = (format: 'xlsx' | 'csv') =>
    void downloadRegistryTemplate(format).catch((error) => {
      console.error('template download failed', error);
      toast.error('No se pudo descargar la plantilla.');
    });

  return (
    <div className="space-y-4">
      <SourceCard
        icon={<Gem className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        title="Sube la Mina de Oro"
        description="El reporte de cartera de Seguros Monterrey. Registra o actualiza todas tus pólizas, clientes y asesores de una vez."
      >
        <SpreadsheetDropzone label="Elige la Mina de Oro" onFile={(file) => onPick('mina_de_oro', file)} disabled={disabled} />
      </SourceCard>

      <OrDivider />

      <SourceCard
        icon={<FileSpreadsheet className="h-5 w-5" strokeWidth={1.75} aria-hidden />}
        title="Usa la plantilla de LifeOps"
        description="Descárgala, llénala en Excel con tus pólizas (una por fila) y súbela aquí."
        actions={
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => download('xlsx')} className="gap-2">
              <Download className="h-4 w-4" aria-hidden />
              Plantilla en Excel
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => download('csv')} className="gap-2">
              <Download className="h-4 w-4" aria-hidden />
              En CSV
            </Button>
          </>
        }
      >
        <SpreadsheetDropzone label="Sube la plantilla llena" onFile={(file) => onPick('template', file)} disabled={disabled} />
      </SourceCard>
    </div>
  );
}
