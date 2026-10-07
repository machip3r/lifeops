'use client';

/**
 * THESIS: Full left nav on desktop; mobile drawer from the right via burger only.
 * OWN-WORLD: LifeOps chrome + gold active; theme/sign-out under profile (no borders).
 * STORY: Always-readable nav labels on desktop; drawer on small screens.
 * FIRST VIEWPORT: LifeOps wordmark, icon+label nav, profile footer.
 * FORM: Archive rail on LifeOps colors — no hover collapse.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  FileUp,
  FileText,
  Wallet,
  Users,
  UserRoundCog,
  X,
  LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/contexts/auth-context';
import { ThemeToggle } from '@/components/theme-toggle';

export type DashboardNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type DashboardSidebarProps = {
  open: boolean;
  onClose: () => void;
  navItems: DashboardNavItem[];
  profile: {
    name: string;
    email: string;
    role: UserRole;
  };
  onSignOut: () => void;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export const promotoryNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Vista general', icon: LayoutDashboard },
  { href: '/dashboard/extractor', label: 'Importar datos', icon: FileUp },
  { href: '/dashboard/contracts', label: 'Pólizas', icon: FileText },
  { href: '/dashboard/collections', label: 'Cobranza', icon: Wallet },
  { href: '/dashboard/clients', label: 'Clientes', icon: Users },
  { href: '/dashboard/consultants', label: 'Asesores', icon: UserRoundCog },
];

export const consultantNavItems: DashboardNavItem[] = [
  { href: '/dashboard', label: 'Vista general', icon: LayoutDashboard },
  { href: '/dashboard/extractor', label: 'Importar datos', icon: FileUp },
  { href: '/dashboard/contracts', label: 'Pólizas', icon: FileText },
  { href: '/dashboard/collections', label: 'Cobranza', icon: Wallet },
  { href: '/dashboard/clients', label: 'Clientes', icon: Users },
];

export const SIDEBAR_WIDTH_CLASS = 'lg:w-[260px]';

const railTransition =
  'duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]';

export function DashboardSidebar({
  open,
  onClose,
  navItems,
  profile,
  onSignOut,
}: DashboardSidebarProps) {
  const pathname = usePathname();
  const initials = initialsFromName(profile.name);
  const roleLabel = profile.role === 'promotory' ? 'Promotoría' : 'Asesor';

  return (
    <>
      <button
        type="button"
        aria-label="Cerrar menú"
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity lg:hidden',
          railTransition,
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col overflow-hidden border-[var(--lifeops-border)] bg-[var(--lifeops-chrome)] text-[var(--lifeops-fg)]',
          'transition-[transform,opacity]',
          railTransition,
          'right-0 left-auto border-l max-lg:shadow-2xl',
          open ? 'max-lg:translate-x-0 max-lg:opacity-100' : 'max-lg:translate-x-full max-lg:opacity-0',
          'lg:left-0 lg:right-auto lg:w-[260px] lg:border-l-0 lg:border-r lg:translate-x-0 lg:opacity-100'
        )}
      >
        <div className="flex h-20 items-center border-b border-[var(--lifeops-border)] px-4 sm:h-24 lg:h-[4.75rem]">
          <Link
            href="/dashboard"
            onClick={onClose}
            className="min-w-0 flex-1 truncate text-2xl font-medium outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC] lg:text-[1.65rem]"
          >
            Life
            <strong>Ops</strong>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer shrink-0 rounded-md p-2 text-(--lifeops-muted) hover:bg-[var(--lifeops-hover)] hover:text-[var(--lifeops-fg)] lg:hidden"
            aria-label="Cerrar menú"
          >
            <X className="h-6 w-6" strokeWidth={1.75} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-4" aria-label="Principal">
          <ul className="flex flex-col gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`));

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={cn(
                      'flex min-h-12 items-center gap-3.5 px-3 py-3 text-base font-medium transition-colors',
                      isActive
                        ? 'bg-[#FBDBAC] text-[#1a1d24]'
                        : 'text-(--lifeops-muted) hover:bg-[var(--lifeops-hover)] hover:text-[var(--lifeops-fg)]'
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon
                      className={cn(
                        'h-6 w-6 shrink-0',
                        isActive ? 'text-[#1a1d24]' : 'text-(--lifeops-muted)'
                      )}
                      strokeWidth={1.75}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-[var(--lifeops-border)] px-3 py-3">
          <Link
            href="/dashboard/profile"
            onClick={onClose}
            title={profile.name}
            className="flex min-w-0 items-center gap-3 rounded-sm px-1 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
          >
            <span
              className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#FBDBAC]/40 bg-[var(--lifeops-hover)] text-xs font-semibold text-[var(--lifeops-accent)]"
              aria-hidden
            >
              {initials}
            </span>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-base font-medium text-[var(--lifeops-fg)]">
                {profile.name}
              </span>
              <span className="mt-0.5 block truncate text-sm text-(--lifeops-muted)">
                {roleLabel}
              </span>
              <span className="mt-0.5 block truncate text-sm text-(--lifeops-muted) opacity-80">
                {profile.email}
              </span>
            </span>
          </Link>

          <div className="mt-3 flex w-full gap-1.5">
            <ThemeToggle
              showLabel
              className="h-11 w-1/2 cursor-pointer gap-1.5 rounded-md text-sm hover:bg-[var(--lifeops-hover)]"
            />
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex h-11 w-1/2 cursor-pointer items-center justify-center gap-1.5 rounded-md text-sm text-red-500 transition-colors hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FBDBAC]"
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5 shrink-0" strokeWidth={1.75} />
              <span className="truncate">Salir</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
