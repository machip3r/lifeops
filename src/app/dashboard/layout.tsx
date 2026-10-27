'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { ToastProvider } from '@/components/toast';
import { NavigationGuardProvider } from '@/contexts/navigation-guard';
import {
  DashboardSidebar,
  consultantNavItems,
  promotoryNavItems,
} from '@/components/dashboard/sidebar';
import { assets } from '@/app/theme/assets';
import { Button } from '@/components/ui/button';
import { needsOnboarding, ONBOARDING_PATH } from '@/lib/onboarding/routes';
import { AppShellSkeleton, AuthCardSkeleton } from '@/components/ui/skeleton';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile, loading, session, signOut, profilePhase, reloadProfile } = useAuth();
  const router = useRouter();
  const [sidebarPath, setSidebarPath] = useState(pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  if (sidebarPath !== pathname) {
    setSidebarPath(pathname);
    setSidebarOpen(false);
  }

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login');
    }
  }, [loading, session, router]);

  const mustOnboard = Boolean(profile && needsOnboarding(profile));
  useEffect(() => {
    if (mustOnboard) router.replace(ONBOARDING_PATH);
  }, [mustOnboard, router]);

  if (loading || (session && !profile && profilePhase === 'loading')) {
    return <AppShellSkeleton />;
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--lifeops-page) px-4">
        <AuthCardSkeleton />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--lifeops-page)">
        <div className="mx-auto max-w-md px-6 text-center">
          <p className="mb-2 text-lg text-(--lifeops-fg)">No pudimos cargar tu perfil</p>
          <p className="mb-6 text-sm text-(--lifeops-muted)">
            No encontramos tu promotoría ni tu perfil de asesor. Puedes reintentar o volver a entrar.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button type="button" variant="brand" onClick={() => void reloadProfile()}>
              Reintentar
            </Button>
            <Button type="button" variant="outline" onClick={() => void signOut()}>
              Volver a iniciar sesión
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (mustOnboard) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--lifeops-page) px-4">
        <AuthCardSkeleton />
      </div>
    );
  }

  const navItems = profile.role === 'promotory' ? promotoryNavItems : consultantNavItems;
  const brandParts = assets.brand.name.split('O');

  return (
    <ToastProvider>
      <NavigationGuardProvider>
      <div className="flex min-h-screen dashboard-gradient-bg">
        <DashboardSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navItems={navItems}
          profile={profile}
          onSignOut={signOut}
        />

        <div className="hidden w-[232px] shrink-0 lg:block" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-(--lifeops-border) bg-(--lifeops-chrome) px-3 lg:hidden">
            <span
              className="min-w-0 truncate text-2xl font-semibold tracking-tight text-(--lifeops-fg)"
              style={{ fontFamily: 'var(--font-lexend), Arial, Helvetica, sans-serif' }}
            >
              {brandParts[0]}
              <strong className="font-bold">Ops</strong>
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 p-2 text-(--lifeops-fg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
              aria-label="Abrir menú"
            >
              <Menu className="h-6 w-6" strokeWidth={1.75} />
            </button>
          </header>

          <main className="min-h-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="mx-auto max-w-[1600px]">{children}</div>
          </main>
        </div>
      </div>
      </NavigationGuardProvider>
    </ToastProvider>
  );
}
