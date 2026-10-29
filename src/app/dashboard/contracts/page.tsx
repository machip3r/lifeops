'use client';

import { useState } from 'react';
import { CalendarClock, CalendarX, FileText, Siren } from 'lucide-react';
import type { ContractPortfolio } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import ProtectedRoute from '@/components/protected-route';
import { ManualContractDialog } from '@/components/contracts/manual-contract-dialog';
import { ContractPortfolioPanel } from '@/components/contracts/contract-portfolio-panel';
import { Button } from '@/components/ui/button';
import { StatTile } from '@/components/dashboard/overview/stat-tile';
import { numberEs } from '@/components/dashboard/overview/chart-parts';
import { POLICY_AT_RISK_DAYS } from '@/lib/collections/constants';
import { PageHeader } from '@/components/dashboard/page-header';
import { GettingStarted } from '@/components/dashboard/getting-started';
import { useContractCount } from '@/hooks/use-contract-count';
import { StatTilesSkeleton } from '@/components/ui/skeleton';

function ContractsPageContent() {
  const { profile } = useAuth();
  const officeView = profile?.role === 'promotory';
  const [portfolio, setPortfolio] = useState<ContractPortfolio | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  // Remounts the list after registering a póliza
  const [listKey, setListKey] = useState(0);
  const summary = portfolio?.summary;
  const cartera = useContractCount(
    officeView ? { officeId: profile?.id } : { consultantId: profile?.id },
    Boolean(profile),
  );

  if (!profile) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pólizas"
        watermark="Pólizas"
        description={
          officeView
            ? 'La cartera de tus asesores: estado de cobro, próximo recibo y expediente de cada póliza.'
            : 'Tu cartera: estado de cobro, próximo recibo y expediente de cada póliza.'
        }
      />

      <ManualContractDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setListKey((key) => key + 1);
          void cartera.reload();
        }}
      />

      {cartera.count === 0 ? (
        <GettingStarted
          context="contracts"
          onRegistered={() => {
            void cartera.reload();
            setListKey((key) => key + 1);
          }}
        />
      ) : summary ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            label="Pólizas en vigor"
            icon={FileText}
            value={summary ? numberEs.format(summary.active) : '—'}
            detail={
              summary
                ? officeView
                  ? `${numberEs.format(summary.clients)} clientes · ${numberEs.format(summary.consultants)} asesores`
                  : `${numberEs.format(summary.clients)} clientes`
                : undefined
            }
          />
          <StatTile
            label="Cobros en 30 días"
            icon={CalendarClock}
            value={summary ? numberEs.format(summary.due_next_30_days) : '—'}
            detail="Según su calendario de recibos"
          />
          <StatTile
            label="En peligro"
            icon={Siren}
            value={summary ? numberEs.format(summary.at_risk) : '—'}
            detail={`Más de ${POLICY_AT_RISK_DAYS} días sin pago`}
          />
          <StatTile
            label="Sin fecha de cobro"
            icon={CalendarX}
            value={summary ? numberEs.format(summary.no_payment) : '—'}
            detail={
              summary && summary.missing_payment_method > 0
                ? `Sin emisión ni pagos · ${numberEs.format(summary.missing_payment_method)} sin forma de pago`
                : 'Sin fecha de emisión ni pagos'
            }
          />
        </div>
      ) : (
        <StatTilesSkeleton />
      )}

      {cartera.count === 0 ? null : (
        <ContractPortfolioPanel
          key={listKey}
          scope={officeView ? { officeId: profile.id } : { consultantId: profile.id }}
          showConsultant={officeView}
          searchPlaceholder={officeView ? 'Póliza, cliente o asesor…' : 'Póliza o cliente…'}
          emptyText="Aún no hay pólizas. Regístrala aquí o impórtalas desde el extractor."
          onLoaded={setPortfolio}
          actions={
            <Button type="button" variant="brand" size="lg" onClick={() => setManualOpen(true)}>
              Registrar póliza
            </Button>
          }
        />
      )}
    </div>
  );
}

export default function ContractsPage() {
  return (
    <ProtectedRoute allowedRoles={['promotory', 'consultant']}>
      <ContractsPageContent />
    </ProtectedRoute>
  );
}
