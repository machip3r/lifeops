'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { ToastProvider } from '@/components/toast';
import {
  DashboardSidebar,
  consultantNavItems,
  promotoryNavItems,
} from '@/components/dashboard/sidebar';
import { assets } from '@/app/theme/assets';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile, loading, session, signOut } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !session) {
      router.push('/login');
    }
  }, [loading, session, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--lifeops-page)]">
        <div className="text-center">
          <p className="text-lg text-[var(--lifeops-fg)]">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--lifeops-page)]">
        <div className="text-center">
          <p className="text-lg text-[var(--lifeops-fg)]">
            Redirigiendo al inicio de sesión...
          </p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--lifeops-page)]">
        <div className="text-center">
          <p className="mb-4 text-lg text-[var(--lifeops-fg)]">Cargando tu perfil...</p>
          <p className="text-sm text-[var(--lifeops-accent)]">Esto puede tomar un momento</p>
        </div>
      </div>
    );
  }

  const navItems = profile.role === 'promotory' ? promotoryNavItems : consultantNavItems;
  const brandParts = assets.brand.name.split('O');

  return (
    <ToastProvider>
      <div className="flex min-h-screen dashboard-gradient-bg">
        <DashboardSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          navItems={navItems}
          profile={profile}
          onSignOut={signOut}
        />

        <div className="hidden w-[260px] shrink-0 lg:block" aria-hidden />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-20 items-center justify-between gap-3 border-b border-[var(--lifeops-border)] bg-[var(--lifeops-chrome)] px-3 sm:h-24 lg:hidden">
            <span
              className="min-w-0 truncate text-3xl font-semibold tracking-tight text-[var(--lifeops-fg)] sm:text-4xl"
              style={{ fontFamily: 'var(--font-lexend), Arial, Helvetica, sans-serif' }}
            >
              {brandParts[0]}
              <strong className="font-bold">Ops</strong>
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="shrink-0 p-2 text-[var(--lifeops-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
              aria-label="Abrir menú"
            >
              <Menu className="h-8 w-8" strokeWidth={1.75} />
            </button>
          </header>

          <main className="min-h-0 flex-1 px-4 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-7xl">{children}</div>
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
