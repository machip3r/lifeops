import { FilePen, FilePlus2, HandCoins, History, Mail, Undo2, UserRoundCog, UserX, type LucideIcon } from 'lucide-react';
import type { AuditLogEntry } from '@/lib/supabase';
import { formatDateShortEsLocal } from '@/lib/format/date';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const ACTOR: Record<string, string> = { office: 'Promotoría', consultant: 'Asesor', system: 'Sistema' };

/** Spanish labels of the audited fields (póliza, recibo, cliente, asesor). */
const FIELD_LABELS: Record<string, string> = {
  contract_number: 'número de póliza',
  issue_date: 'fecha de emisión',
  payment_method: 'forma de pago',
  collection_day: 'día de cobro',
  currency: 'moneda',
  annual_premium: 'prima anual',
  insured_amount: 'suma asegurada',
  project_name: 'proyecto',
  status: 'estado',
  name: 'nombre',
  birth_date: 'fecha de nacimiento',
  curp: 'CURP',
  rfc: 'RFC',
  phone: 'teléfono',
  email: 'correo',
  consultant_code: 'clave',
  receipt_number: 'número de recibo',
  payment_date: 'fecha de pago',
  premium_payment: 'prima pago',
  collection_premium: 'prima cobro',
  target_premium: 'prima meta',
  commission_premium: 'prima comisión',
  commission_honoraries: 'comisión',
  commission_percentage: '% comisión',
  seniority: 'antigüedad',
  movement: 'movimiento',
};

type Line = { icon: LucideIcon; title: string; detail?: string | null };

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function monthLabel(values: Record<string, unknown> | null): string | null {
  const month = Number(values?.month);
  const year = Number(values?.year);
  return month >= 1 && month <= 12 && year ? `${MONTHS[month - 1]} ${year}` : null;
}

/** "forma de pago, día de cobro" — fields whose value really changed. */
function changedFields(entry: AuditLogEntry): string | null {
  const prev = entry.old_values ?? {};
  const next = entry.new_values ?? {};
  const keys = Object.keys(next).filter((key) => String(prev[key] ?? null) !== String(next[key] ?? null));
  const labels = keys.map((key) => FIELD_LABELS[key]).filter(Boolean);
  if (labels.length === 0) return null;
  const sentence = labels.join(', ');
  return `Cambió: ${sentence}`;
}

/** Spanish copy for one audit row; unknown actions fall back to a generic line. */
function describe(entry: AuditLogEntry): Line {
  const next = entry.new_values;
  const prev = entry.old_values;
  switch (entry.action) {
    case 'contract.create':
      return { icon: FilePlus2, title: 'Póliza registrada', detail: next?.source === 'manual' ? 'Alta manual' : null };
    case 'contract.update':
      return { icon: FilePen, title: 'Póliza editada', detail: changedFields(entry) };
    case 'contract.reassign':
      return { icon: UserRoundCog, title: 'Asesor reasignado', detail: text(next?.notes) };
    case 'contract.reassign_client':
      return {
        icon: UserRoundCog,
        title: 'Cliente reasignado',
        detail: [text(next?.client_name) ? `Ahora de ${text(next?.client_name)}` : null, text(next?.notes)].filter(Boolean).join(' · ') || null,
      };
    case 'contract_detail.update':
      return {
        icon: FilePen,
        title: text(prev?.receipt_number) ? `Recibo ${text(prev?.receipt_number)} editado` : 'Recibo editado',
        detail: changedFields(entry),
      };
    case 'client.update':
      return { icon: FilePen, title: 'Datos del cliente editados', detail: changedFields(entry) };
    case 'consultant.update':
      return { icon: FilePen, title: 'Datos del asesor editados', detail: changedFields(entry) };
    case 'consultant.invite':
      return { icon: Mail, title: 'Invitación enviada', detail: text(next?.email) };
    case 'consultant.deactivate':
    case 'consultant.delete':
      return { icon: UserX, title: 'Asesor dado de baja' };
    case 'collection.payment_upsert': {
      const paid = text(next?.paid_at);
      return {
        icon: HandCoins,
        title: `Pago registrado${monthLabel(next) ? ` · ${monthLabel(next)}` : ''}`,
        detail: paid ? `Pagado el ${formatDateShortEsLocal(paid.slice(0, 10))}` : null,
      };
    }
    case 'collection.payment_clear':
      return { icon: Undo2, title: `Pago quitado${monthLabel(prev) ? ` · ${monthLabel(prev)}` : ''}` };
    case 'collection.status_change':
      return {
        icon: History,
        title: 'Estatus de cobranza actualizado',
        detail: [text(prev?.collection_status), text(next?.collection_status)].filter(Boolean).join(' → ') || null,
      };
    case 'collection.payment_channel_change':
      return { icon: History, title: 'Conducto de cobro actualizado', detail: text(next?.payment_channel) };
    case 'collection.project_name_change':
      return { icon: History, title: 'Proyecto actualizado', detail: text(next?.project_name) };
    default:
      return { icon: History, title: 'Cambio registrado' };
  }
}

/** History card from `audit_log` (póliza, cliente or asesor expediente). */
export function ActivityCard({
  entries,
  emptyText = 'Sin cambios registrados todavía.',
}: {
  entries: AuditLogEntry[];
  emptyText?: string;
}) {
  return (
    <section className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome)">
      <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-2.5 sm:px-5">
        <h2 className="text-[15px] font-semibold text-(--lifeops-fg)">Historial</h2>
        <span className="text-sm text-(--lifeops-muted)">{entries.length}</span>
      </header>
      {entries.length === 0 ? (
        <p className="px-4 pb-5 text-sm text-(--lifeops-muted) sm:px-5">{emptyText}</p>
      ) : (
        <ol className="max-h-[28rem] divide-y divide-(--lifeops-border) overflow-y-auto border-t border-(--lifeops-border)">
          {entries.map((entry) => {
            const { icon: Icon, title, detail } = describe(entry);
            const who = entry.source === 'import' ? 'Importación' : ACTOR[entry.actor_role ?? ''] ?? null;
            return (
              <li key={entry.id} className="flex gap-3 px-4 py-2.5 sm:px-5">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-(--lifeops-muted)" aria-hidden />
                <div className="min-w-0 text-sm">
                  <p className="text-(--lifeops-fg)">{title}</p>
                  {detail ? <p className="break-words text-(--lifeops-muted)">{detail}</p> : null}
                  <p className="text-xs text-(--lifeops-muted)">
                    {formatDateShortEsLocal(entry.created_at.slice(0, 10))}
                    {who ? ` · ${who}` : ''}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
