'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, FilePlus2, FolderOpen, Upload, type LucideIcon } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { ManualContractDialog } from '@/components/contracts/manual-contract-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

/** Page that shows the empty cartera: changes the explanation */
type Context = 'overview' | 'collections' | 'contracts';

const DESCRIPTION: Record<Context, { office: string; consultant: string }> = {
  overview: {
    office: 'Aún no hay pólizas en tu promotoría. En cuanto las cargues, aquí vas a ver la cobranza, las gráficas y los recibos por cobrar.',
    consultant: 'Aún no tienes pólizas. En cuanto las cargues, aquí vas a ver tu cobranza, las gráficas y los recibos por cobrar.',
  },
  collections: {
    office: 'Para cobrar necesitas pólizas en vigor. Cárgalas y aquí aparecerán los recibos de cada una, al día o atrasados.',
    consultant: 'Para cobrar necesitas pólizas en vigor. Cárgalas y aquí aparecerán los recibos de cada una, al día o atrasados.',
  },
  contracts: {
    office: 'Aquí verás la cartera de tus asesores con el estado de cobro y el expediente de cada póliza.',
    consultant: 'Aquí verás tu cartera con el estado de cobro y el expediente de cada póliza.',
  },
};

function OptionCard({
  icon: Icon,
  title,
  description,
  action,
  highlight = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'flex flex-col items-start gap-3 rounded-xl border border-(--lifeops-accent)/60 bg-[#FBDBAC]/[0.06] p-5 text-left'
          : 'flex flex-col items-start gap-3 rounded-xl border border-(--lifeops-border) bg-(--lifeops-page)/40 p-5 text-left'
      }
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
      </span>
      <div>
        <h3 className="text-[15px] font-semibold text-(--lifeops-fg)">{title}</h3>
        <p className="mt-1 text-sm text-(--lifeops-muted)">{description}</p>
      </div>
      <div className="mt-auto pt-1">{action}</div>
    </div>
  );
}

/**
 * Empty cartera (no pólizas yet): big icon and the two ways to start — import files or register
 * a póliza by hand. Used by Vista general, Cobranza and Pólizas.
 */
export function GettingStarted({ context, onRegistered }: { context: Context; onRegistered?: () => void }) {
  const { profile } = useAuth();
  const [manualOpen, setManualOpen] = useState(false);
  const office = profile?.role === 'promotory';

  return (
    <>
      {/* Centered in the space left under the page header, away from its texts */}
      <div className="flex min-h-[calc(100dvh-15rem)] items-center justify-center py-8 sm:py-12">
        <EmptyState
          icon={FolderOpen}
          title={office ? 'Empieza a cargar tu cartera' : 'Empieza a cargar tus pólizas'}
          description={DESCRIPTION[context][office ? 'office' : 'consultant']}
          className="w-full max-w-4xl"
        >
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <OptionCard
              highlight
              icon={Upload}
              title={office ? 'Importa tus datos' : 'Importa tus comisiones'}
              description={
                office
                  ? 'Sube la Mina de Oro, la plantilla de LifeOps o tus archivos de comisiones. Se registran pólizas, clientes y asesores de una vez.'
                  : 'Sube tus archivos de comisiones del portal y se registran tus pólizas, clientes y pagos.'
              }
              action={
                <Button asChild variant="brand" className="gap-2">
                  <Link href="/dashboard/extractor">
                    Ir a Importar
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </Button>
              }
            />
            <OptionCard
              icon={FilePlus2}
              title="Registra una póliza"
              description="Captúrala a mano: cliente, asesor, fecha de emisión y forma de pago. Su calendario de cobro se arma solo."
              action={
                <Button type="button" variant="outline" onClick={() => setManualOpen(true)}>
                  Registrar póliza
                </Button>
              }
            />
          </div>
          {office ? (
            <p className="mt-6 text-sm text-(--lifeops-muted)">
              ¿Tu equipo aún no está en LifeOps?{' '}
              <Link href="/dashboard/consultants" className="font-medium text-(--lifeops-accent) hover:underline">
                Invita a tus asesores
              </Link>
            </p>
          ) : null}
        </EmptyState>
      </div>

      <ManualContractDialog
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        onCreated={() => {
          setManualOpen(false);
          onRegistered?.();
        }}
      />
    </>
  );
}
