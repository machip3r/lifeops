'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { CalendarClock, CircleDot, FileText, HandCoins, Pencil, Trash2 } from 'lucide-react';
import type { AuditLogEntry, Client, ContractPortfolio } from '@/lib/supabase';
import { db } from '@/lib/db';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { PageHeader } from '@/components/dashboard/page-header';
import { DetailCard, DetailRow, DetailRows } from '@/components/dashboard/detail-card';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { CarteraStatusCard } from '@/components/dashboard/overview/cartera-status';
import { EditClientDialog } from '@/components/clients/edit-client-dialog';
import { ActivityCard } from '@/components/dashboard/activity-card';
import { EntityActionButton } from '@/components/dashboard/entity-action-button';
import { DeleteClientDialog } from '@/components/delete-dialogs';
import { ContractPortfolioPanel } from '@/components/contracts/contract-portfolio-panel';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { DotBadge } from '@/components/ui/dot-badge';
import { CARTERA_STATUS, type CarteraStatus } from '@/lib/collections/status';
import { ageFromBirthDate, formatDateShortEsLocal } from '@/lib/format/date';
import { formatMxPhone } from '@/lib/validation/input-filters';
import { useQueryEffect, useQueryLoading } from '@/hooks/use-query-effect';
import { ChartSkeleton, DetailPageSkeleton, StatTilesSkeleton } from '@/components/ui/skeleton';

/** Most critical bucket among the client's active pólizas. */
function worstStatus(summary: ContractPortfolio['summary']): CarteraStatus | null {
  if (summary.at_risk) return 'at_risk';
  if (summary.overdue) return 'overdue';
  if (summary.due_soon) return 'due_soon';
  if (summary.current) return 'current';
  if (summary.no_payment) return 'no_payment';
  return null;
}

function ClientDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const clientId = params.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const officeView = profile?.role === 'promotory';
  const [client, setClient] = useState<Client | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [portfolio, setPortfolio] = useState<ContractPortfolio | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [loading, setLoading] = useQueryLoading(clientId);

  const loadClient = useCallback(async () => {
    try {
      const [data, entries] = await Promise.all([
        db.client.getClientById(clientId),
        db.auditLog.listByEntity('client', clientId).catch((error) => {
          console.error('Error loading client activity:', error);
          return [] as AuditLogEntry[];
        }),
      ]);
      setClient(data);
      setActivity(entries);
    } catch (error) {
      console.error('Error loading client data:', error);
    } finally {
      setLoading(false);
    }
  }, [clientId, setLoading]);

  useQueryEffect(Boolean(clientId), loadClient);

  if (loading && !client) {
    return (
      <DetailPageSkeleton />
    );
  }

  if (!client || !profile) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg text-(--lifeops-muted)">No encontramos este cliente.</p>
        <Button type="button" variant="brand" onClick={() => router.push('/dashboard/clients')}>
          Volver a clientes
        </Button>
      </div>
    );
  }

  const age = ageFromBirthDate(client.birth_date);
  const summary = portfolio?.summary;
  const worst = summary ? worstStatus(summary) : null;
  const late = summary ? summary.overdue + summary.at_risk : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={client.name}
        watermark="Cliente"
        eyebrow={
          <Link href="/dashboard/clients" className="inline-flex items-center text-[#FBDBAC] hover:underline">
            ← Volver a clientes
          </Link>
        }
        description="Expediente del cliente: contacto, pólizas y cómo va con sus pagos."
        actions={
          <div className="flex flex-wrap gap-2">
            <EntityActionButton icon={Pencil} label="Editar" onClick={() => setEditOpen(true)} />
            <EntityActionButton icon={Trash2} label="Eliminar" variant="danger" disabled={!portfolio} onClick={() => setDeleteOpen(true)} />
          </div>
        }
      />

      {summary ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Pólizas activas"
            icon={FileText}
            value={summary ? numberEs.format(summary.active) : '—'}
            detail={
              summary && officeView && summary.consultants > 0
                ? `Con ${numberEs.format(summary.consultants)} asesor(es)`
                : undefined
            }
          />
          <StatTile
            label="Estado"
            icon={CircleDot}
            value={
              <span className="flex items-center gap-2 text-xl">
                {worst ? (
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: CARTERA_STATUS[worst].color }} aria-hidden />
                ) : null}
                {worst ? CARTERA_STATUS[worst].label : 'Sin póliza activa'}
              </span>
            }
            detail={late > 0 ? `${numberEs.format(late)} póliza(s) con atraso` : summary?.active ? 'Sin atrasos' : undefined}
          />
          <StatTile
            label="Cobros en 30 días"
            icon={CalendarClock}
            value={summary ? numberEs.format(summary.due_next_30_days) : '—'}
            detail="Según el calendario de recibos"
          />
          <StatTile
            label="Pagos en 30 días"
            icon={HandCoins}
            value={summary ? numberEs.format(summary.payments_last_30_days) : '—'}
            detail="Registrados en cobranza o en archivos"
          />
        </div>
      ) : (
        <StatTilesSkeleton />
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-4">
          <DetailCard className="mb-0" title="Datos del cliente">
            <DetailRows>
              <DetailRow label="Teléfono">
                {client.phone ? (
                  <a
                    href={`https://wa.me/52${client.phone}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-(--lifeops-accent) hover:underline"
                  >
                    {formatMxPhone(client.phone)}
                  </a>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Correo">
                {client.email ? (
                  <a href={`mailto:${encodeURIComponent(client.email)}`} className="text-(--lifeops-accent) hover:underline">
                    {client.email}
                  </a>
                ) : (
                  '—'
                )}
              </DetailRow>
              <DetailRow label="Nacimiento">
                {client.birth_date
                  ? `${formatDateShortEsLocal(client.birth_date)}${age != null ? ` · ${age} años` : ''}`
                  : '—'}
              </DetailRow>
              <DetailRow label="CURP">
                <span className="font-mono">{client.curp || '—'}</span>
              </DetailRow>
              <DetailRow label="RFC">
                <span className="font-mono">{client.rfc || '—'}</span>
              </DetailRow>
              <DetailRow label="Registrado">{formatDateShortEsLocal(client.created_at?.slice(0, 10))}</DetailRow>
              <DetailRow label="Estado">
                {worst ? (
                  <DotBadge label={CARTERA_STATUS[worst].label} color={CARTERA_STATUS[worst].color} />
                ) : (
                  <DotBadge label="Sin póliza activa" color="var(--lifeops-muted)" />
                )}
              </DetailRow>
            </DetailRows>
            {!client.phone && !client.email ? (
              <p className="mt-4 text-xs text-(--lifeops-muted)">
                Agrega teléfono o correo con «Editar» para poder contactarlo por su cobranza.
              </p>
            ) : null}
          </DetailCard>
          <ActivityCard entries={activity} />
        </div>

        {summary ? (
          <CarteraStatusCard status={summary} className="lg:col-span-2 lg:self-start" />
        ) : (
          <ChartSkeleton className="lg:col-span-2" bars={4} />
        )}
      </div>

      <ContractPortfolioPanel
        scope={{
          ...(officeView ? { officeId: profile.id } : { consultantId: profile.id }),
          clientId: client.id,
        }}
        showClient={false}
        showConsultant={officeView}
        title="Pólizas del cliente"
        description="Estado de cobro y próximo recibo de cada póliza."
        searchPlaceholder="Número de póliza…"
        emptyText="Este cliente aún no tiene pólizas."
        onLoaded={setPortfolio}
      />

      <EditClientDialog
        open={editOpen}
        client={client}
        onClose={() => setEditOpen(false)}
        onSaved={(updated) => {
          setClient(updated);
          toast.success('Cliente actualizado.');
          void loadClient();
        }}
      />

      <DeleteClientDialog
        client={deleteOpen ? { id: client.id, name: client.name, contractCount: portfolio?.counts.all ?? 0 } : null}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push('/dashboard/clients')}
      />
    </div>
  );
}

export default function ClientDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['consultant', 'promotory']}>
      <ClientDetailsPageContent />
    </ProtectedRoute>
  );
}
