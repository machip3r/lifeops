'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { FileText, Gauge, HandCoins, Pencil, Send, Siren, Trash2 } from 'lucide-react';
import type { AuditLogEntry, Consultant, ContractPortfolio } from '@/lib/supabase';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { PageHeader } from '@/components/dashboard/page-header';
import { DetailCard, DetailRow, DetailRows } from '@/components/dashboard/detail-card';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { CarteraStatusCard } from '@/components/dashboard/overview/cartera-status';
import { EditConsultantDialog } from '@/components/consultants/edit-consultant-dialog';
import { ActivityCard } from '@/components/dashboard/activity-card';
import { EntityActionButton } from '@/components/dashboard/entity-action-button';
import { DeleteConsultantDialog } from '@/components/delete-dialogs';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { ContractPortfolioPanel } from '@/components/contracts/contract-portfolio-panel';
import { useToast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { DotBadge } from '@/components/ui/dot-badge';
import { CONSULTANT_STATUS } from '@/lib/consultants/status';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { formatDateShortEsLocal } from '@/lib/format/date';
import { useQueryEffect, useQueryLoading } from '@/hooks/use-query-effect';
import { ChartSkeleton, DetailPageSkeleton, StatTilesSkeleton } from '@/components/ui/skeleton';

const percentEs = new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 0 });

const ACCESS_HINT: Record<Consultant['status'], string> = {
  ACTIVE: 'Ya entra a LifeOps y ve su propia cartera.',
  PENDING: 'Se le envió la invitación; aún no la acepta.',
  NOT_INVITED: 'Todavía no tiene acceso. Invítalo para que vea su cartera.',
  INACTIVE: 'Sin acceso a LifeOps.',
};

function ConsultantDetailsPageContent() {
  const router = useRouter();
  const params = useParams();
  const consultantId = params.id as string;
  const { profile } = useAuth();
  const { toast } = useToast();
  const [consultant, setConsultant] = useState<Consultant | null>(null);
  const [activity, setActivity] = useState<AuditLogEntry[]>([]);
  const [portfolio, setPortfolio] = useState<ContractPortfolio | null>(null);
  const [loading, setLoading] = useQueryLoading(consultantId);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteConfirmOpen, setInviteConfirmOpen] = useState(false);

  const loadConsultant = useCallback(async () => {
    try {
      const [data, entries] = await Promise.all([
        db.consultant.getConsultantById(consultantId),
        db.auditLog.listByEntity('consultant', consultantId).catch((error) => {
          console.error('Error loading consultant activity:', error);
          return [] as AuditLogEntry[];
        }),
      ]);
      setConsultant(data);
      setActivity(entries);
    } catch (err) {
      console.error('Error loading consultant data:', err);
    } finally {
      setLoading(false);
    }
  }, [consultantId, setLoading]);

  useQueryEffect(Boolean(consultantId), loadConsultant);

  const handleSendInvitation = async () => {
    if (!consultant || !profile?.id) return;
    if (!consultant.email?.trim()) {
      toast.error('Agrega el correo del asesor para enviarle la invitación.');
      return;
    }
    setIsSendingInvite(true);
    try {
      const response = await authFetch('/api/invite-consultant', {
        method: 'POST',
        body: JSON.stringify({
          officeId: profile.id,
          consultantId: consultant.id,
          consultantEmail: consultant.email.trim().toLowerCase(),
          consultantName: (consultant.name || consultant.consultant_code || '').trim(),
          consultantCode: (consultant.consultant_code || '').trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        const fieldMsg =
          data.fieldErrors?.consultantEmail ||
          data.fieldErrors?.consultantName ||
          data.fieldErrors?.consultantCode ||
          data.fieldErrors?.consultantId;
        throw new Error(fieldMsg || data.error || 'No se pudo enviar la invitación.');
      }
      setConsultant({
        ...consultant,
        email: consultant.email.trim().toLowerCase(),
        status: 'PENDING',
        auth_user_id: null,
      });
      toast.success(`Invitación enviada a ${consultant.email}.`);
    } catch (err: unknown) {
      console.error('Error sending invitation:', err);
      toast.error(err instanceof Error ? err.message : 'No se pudo enviar la invitación.');
    } finally {
      setIsSendingInvite(false);
    }
  };

  if (loading && !consultant) {
    return (
      <DetailPageSkeleton />
    );
  }

  if (!consultant || !profile) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
        <p className="text-lg text-(--lifeops-muted)">No encontramos este asesor.</p>
        <Button type="button" variant="brand" onClick={() => router.push('/dashboard/consultants')}>
          Volver a asesores
        </Button>
      </div>
    );
  }

  // Imported asesores get an internal placeholder correo; it cannot receive the invitation
  const hasRealEmail = Boolean(consultant.email?.trim()) && !/@lifeops\.com$/i.test(consultant.email ?? '');
  const resend = consultant.status === 'PENDING';

  const summary = portfolio?.summary;
  const withDue = summary ? summary.current + summary.due_soon + summary.overdue + summary.at_risk : 0;
  const healthy = summary && withDue > 0 ? (summary.current + summary.due_soon) / withDue : null;
  const late = summary ? summary.overdue + summary.at_risk : 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={consultant.name}
        watermark="Asesor"
        eyebrow={
          <Link href="/dashboard/consultants" className="inline-flex items-center text-[#FBDBAC] hover:underline">
            ← Volver a asesores
          </Link>
        }
        description={[consultant.consultant_code, consultant.email].filter(Boolean).join(' · ') || 'Expediente del asesor'}
        actions={
          <div className="flex flex-wrap gap-2">
            <EntityActionButton icon={Pencil} label="Editar" onClick={() => setEditOpen(true)} />
            {consultant.status !== 'ACTIVE' && consultant.status !== 'INACTIVE' ? (
              <EntityActionButton
                icon={Send}
                variant="brand"
                label={isSendingInvite ? 'Enviando…' : consultant.status === 'PENDING' ? 'Reenviar invitación' : 'Invitar'}
                onClick={() => {
                  if (!hasRealEmail) {
                    toast.error('Agrega su correo con «Editar» para poder invitarlo.');
                    return;
                  }
                  setInviteConfirmOpen(true);
                }}
                disabled={isSendingInvite}
              />
            ) : null}
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
            detail={summary ? `${numberEs.format(summary.clients)} clientes` : undefined}
          />
          <StatTile
            label="Cartera al día"
            icon={Gauge}
            value={healthy != null ? percentEs.format(healthy) : '—'}
            detail="Al corriente o por vencer"
          />
          <StatTile
            label="Con atraso"
            icon={Siren}
            value={summary ? numberEs.format(late) : '—'}
            detail={summary ? `${numberEs.format(summary.at_risk)} en peligro (más de ${POLICY_AT_RISK_DAYS} días)` : undefined}
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
          <DetailCard className="mb-0" title="Datos del asesor">
            <DetailRows>
              <DetailRow label="Clave">
                <span className="font-mono">{consultant.consultant_code || '—'}</span>
              </DetailRow>
              <DetailRow label="Correo">{consultant.email || 'Sin correo'}</DetailRow>
              <DetailRow label="Alta">{formatDateShortEsLocal(consultant.created_at?.slice(0, 10))}</DetailRow>
              <DetailRow label="Acceso">
                <DotBadge {...CONSULTANT_STATUS[consultant.status]} />
              </DetailRow>
            </DetailRows>
            <p className="mt-4 text-xs text-(--lifeops-muted)">{ACCESS_HINT[consultant.status]}</p>
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
        scope={{ consultantId: consultant.id }}
        title="Cartera del asesor"
        description="Sus pólizas con estado de cobro y próximo recibo."
        searchPlaceholder="Póliza o cliente…"
        emptyText="Este asesor aún no tiene pólizas."
        onLoaded={setPortfolio}
      />

      <ConfirmDialog
        open={inviteConfirmOpen}
        title={resend ? `¿Reenviar la invitación a ${consultant.name}?` : `¿Invitar a ${consultant.name} a LifeOps?`}
        description={`Le llegará un correo a ${consultant.email ?? ''} con un enlace para crear su contraseña e iniciar sesión.\n\nYa dentro verá sus pólizas, sus clientes y su cobranza; no verá la cartera de otros asesores. El enlace vence en 7 días.${
          resend ? '\n\nEl enlace que le mandamos antes dejará de funcionar.' : ''
        }`}
        confirmVariant="brand"
        confirmLabel={resend ? 'Reenviar invitación' : 'Enviar invitación'}
        loadingLabel="Enviando…"
        loading={isSendingInvite}
        onCancel={() => (isSendingInvite ? undefined : setInviteConfirmOpen(false))}
        onConfirm={() => {
          void (async () => {
            await handleSendInvitation();
            setInviteConfirmOpen(false);
          })();
        }}
      />

      <DeleteConsultantDialog
        consultant={
          deleteOpen ? { id: consultant.id, name: consultant.name, contractCount: portfolio?.counts.all ?? 0 } : null
        }
        officeId={profile.id}
        onClose={() => setDeleteOpen(false)}
        onDeleted={() => router.push('/dashboard/consultants')}
      />

      <EditConsultantDialog
        open={editOpen}
        consultant={consultant}
        officeId={profile.id}
        onClose={() => setEditOpen(false)}
        onSaved={(next) => {
          setConsultant({ ...consultant, ...next });
          toast.success('Asesor actualizado.');
          void loadConsultant();
        }}
      />
    </div>
  );
}

export default function ConsultantDetailsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory']}>
      <ConsultantDetailsPageContent />
    </ProtectedRoute>
  );
}
