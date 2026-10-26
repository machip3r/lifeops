'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { assets } from '@/app/theme/assets';
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/auth-context';
import { useOfficeOnboarding } from '@/hooks/use-office-onboarding';
import { homePathFor, needsOnboarding } from '@/lib/onboarding/routes';

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
        <p className="text-lg text-(--lifeops-fg)">Cargando...</p>
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
    <div className="min-h-screen dashboard-gradient-bg px-4 py-8 sm:py-12">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
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

        <div>
          <h1 className="dashboard-page-title text-3xl font-bold sm:text-4xl">Bienvenido a LifeOps</h1>
          <p className="mt-2 text-sm text-(--lifeops-muted)">
            Antes de empezar, cuéntanos de tu promotoría. Te toma un par de minutos y puedes cambiar
            casi todo después en tu perfil.
          </p>
        </div>

        <div className="rounded-xl border border-(--lifeops-border) bg-(--lifeops-chrome) p-5 sm:p-8">
          {dataLoading ? (
            <p className="text-sm text-(--lifeops-muted)">Cargando...</p>
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
  );
}
