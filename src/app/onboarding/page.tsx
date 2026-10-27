'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FileUp, HandCoins, Users } from 'lucide-react';
import { assets } from '@/app/theme/assets';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useOfficeOnboarding } from '@/hooks/use-office-onboarding';
import { homePathFor, needsOnboarding } from '@/lib/onboarding/routes';
import { AuthCardSkeleton, FormSkeleton } from '@/components/ui/skeleton';

const WELCOME_POINTS = [
  { icon: HandCoins, title: 'Cobranza al día', text: 'Próximos cobros, vencidas y pólizas en peligro de un vistazo.' },
  { icon: FileUp, title: 'Importa tus comisiones', text: 'Sube el archivo de la aseguradora y LifeOps arma tu cartera.' },
  { icon: Users, title: 'Tu equipo de asesores', text: 'Cada asesor ve solo su cartera.' },
];

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--lifeops-page) px-4 text-center">
      {children}
    </div>
  );
}

/** Promotoría onboarding: required once after signup (and for older accounts without it). */
export default function OnboardingPage() {
  const { session, profile, loading, profilePhase, signOut, reloadProfile } = useAuth();
  const router = useRouter();
  const pending = Boolean(profile && needsOnboarding(profile));
  const { data, catalogs, error, loading: dataLoading, reload } = useOfficeOnboarding(
    pending && profile ? profile.id : null,
  );

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
    else if (profile && !needsOnboarding(profile)) router.replace(homePathFor(profile));
  }, [loading, session, profile, router]);

  if (loading || (session && !profile && profilePhase === 'loading') || (profile && !pending)) {
    return (
      <CenteredMessage>
        <AuthCardSkeleton />
      </CenteredMessage>
    );
  }

  if (!session) return null;

  if (!profile) {
    return (
      <CenteredMessage>
        <div className="max-w-md">
          <p className="mb-6 text-lg text-(--lifeops-fg)">No pudimos cargar tu cuenta</p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="brand" onClick={() => void reloadProfile()}>
              Reintentar
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Volver a iniciar sesión
            </Button>
          </div>
        </div>
      </CenteredMessage>
    );
  }

  return (
    <div className="min-h-screen dashboard-gradient-bg px-4 py-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <header className="flex items-center justify-between gap-4">
          <span
            className="text-3xl font-semibold tracking-tight text-(--lifeops-fg)"
            style={{ fontFamily: 'var(--font-lexend), Arial, Helvetica, sans-serif' }}
          >
            {assets.brand.name}
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
            Cerrar sesión
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-10">
          <aside className="flex flex-col gap-4 lg:sticky lg:top-10 lg:self-start">
            <div>
              <h1 className="dashboard-page-title text-3xl font-bold sm:text-4xl">Bienvenido a LifeOps</h1>
              <p className="mt-2 text-sm text-(--lifeops-muted)">
                Tres pasos cortos, menos de 2 minutos. Puedes cambiar casi todo después en tu perfil.
              </p>
            </div>
            <ul className="hidden flex-col gap-3 lg:flex">
              {WELCOME_POINTS.map(({ icon: Icon, title, text }) => (
                <li key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--lifeops-hover) text-(--lifeops-accent)">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-(--lifeops-fg)">{title}</p>
                    <p className="text-xs text-(--lifeops-muted)">{text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <div className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5 sm:p-8">
            {dataLoading ? (
              <FormSkeleton fields={3} />
            ) : error || !catalogs ? (
              <div className="flex flex-col items-start gap-4">
                <p className="text-sm text-destructive" role="alert">
                  {error ?? 'No se pudo cargar la información.'}
                </p>
                <Button type="button" variant="outline" onClick={() => void reload()}>
                  Reintentar
                </Button>
              </div>
            ) : (
              <OnboardingWizard data={data} catalogs={catalogs} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
