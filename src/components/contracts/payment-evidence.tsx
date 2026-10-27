'use client';

import { FileImage, FileText, Paperclip } from 'lucide-react';
import type { ContractFile } from '@/lib/db';
import type { ContractCollectionPayment } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { formatDateShortEsLocal } from '@/lib/format/date';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function sizeLabel(bytes: number | null | undefined): string | null {
  if (!bytes) return null;
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function FileRow({
  file,
  detail,
  onOpen,
}: {
  file: ContractFile;
  detail: string | null;
  onOpen: (fileId: string) => void;
}) {
  const Icon = file.file_type?.startsWith('image/') ? FileImage : FileText;
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-muted)">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium text-(--lifeops-fg)">{file.display_name || file.file_name}</p>
        <p className="truncate text-xs text-(--lifeops-muted)">
          {[detail, file.created_at ? `Subido el ${formatDateShortEsLocal(file.created_at.slice(0, 10))}` : null, sizeLabel(file.file_size)]
            .filter(Boolean)
            .join(' · ')}
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => onOpen(file.id)}>
        Ver
      </Button>
    </li>
  );
}

/** Evidencias de pago (and other documents) of a póliza; files open through a short-lived link. */
export function PaymentEvidenceCard({
  files,
  payments,
  onOpen,
}: {
  files: ContractFile[];
  payments: ContractCollectionPayment[];
  onOpen: (fileId: string) => void;
}) {
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  const evidence = files.filter((f) => f.collection_payment_id);
  const others = files.filter((f) => !f.collection_payment_id);

  const evidenceDetail = (file: ContractFile) => {
    const payment = file.collection_payment_id ? paymentById.get(file.collection_payment_id) : undefined;
    if (!payment) return 'Evidencia de pago';
    const month = `${MONTHS[payment.month - 1] ?? ''} ${payment.year}`.trim();
    const paid = payment.paid_at ? `pagado el ${formatDateShortEsLocal(payment.paid_at.slice(0, 10))}` : null;
    return [`Recibo de ${month}`, paid].filter(Boolean).join(', ');
  };

  return (
    <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="flex items-start justify-between gap-3 px-4 pt-4 pb-3 sm:px-5">
        <div>
          <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">Evidencias de pago</h2>
          <p className="mt-0.5 text-xs text-(--lifeops-muted)">
            Comprobantes subidos al registrar pagos en cobranza.
          </p>
        </div>
        <span className="text-sm text-(--lifeops-muted)">{evidence.length}</span>
      </header>

      {evidence.length === 0 ? (
        <p className="flex items-center gap-2 border-t border-(--lifeops-border) px-4 py-4 text-[13px] text-(--lifeops-muted) sm:px-5">
          <Paperclip className="h-4 w-4 shrink-0" aria-hidden />
          Aún no hay evidencias. Se agregan al registrar un pago con su comprobante.
        </p>
      ) : (
        <ul className="divide-y divide-(--lifeops-border) border-t border-(--lifeops-border)">
          {evidence.map((file) => (
            <FileRow key={file.id} file={file} detail={evidenceDetail(file)} onOpen={onOpen} />
          ))}
        </ul>
      )}

      {others.length > 0 ? (
        <>
          <p className="border-t border-(--lifeops-border) px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-wide text-(--lifeops-muted) sm:px-5">
            Otros documentos
          </p>
          <ul className="divide-y divide-(--lifeops-border)">
            {others.map((file) => (
              <FileRow key={file.id} file={file} detail={null} onOpen={onOpen} />
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
