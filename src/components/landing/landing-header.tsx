'use client';

import Link from 'next/link';
import { useEffect, useSyncExternalStore } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

function subscribeToScroll(onStoreChange: () => void) {
  window.addEventListener('scroll', onStoreChange, { passive: true });
  return () => window.removeEventListener('scroll', onStoreChange);
}

function getScrolledSnapshot() {
  return window.scrollY > 12;
}

function getServerSnapshot() {
  return false;
}

type LandingSectionLinkProps = {
  targetId: string;
  className?: string;
  children: React.ReactNode;
};

type LandingTopLinkProps = {
  className?: string;
  children: React.ReactNode;
};

export function LandingTopLink({ className, children }: LandingTopLinkProps) {
  return (
    <Link
      href="/"
      aria-label="LifeOps, volver al inicio"
      className={className}
      onClick={(event) => {
        if (window.location.pathname !== '/') return;

        event.preventDefault();
        window.scrollTo({
          top: 0,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }}
    >
      {children}
    </Link>
  );
}

export function LandingSectionLink({ targetId, className, children }: LandingSectionLinkProps) {
  useEffect(() => {
    const pendingTarget = sessionStorage.getItem('lifeops-landing-section');
    if (!pendingTarget) return;

    sessionStorage.removeItem('lifeops-landing-section');
    requestAnimationFrame(() => {
      document.getElementById(pendingTarget)?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  }, []);

  return (
    <a
      href={`#${targetId}`}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        const section = document.getElementById(targetId);
        if (window.location.pathname !== '/') {
          sessionStorage.setItem('lifeops-landing-section', targetId);
          window.location.assign('/');
          return;
        }

        section?.scrollIntoView({
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
          block: 'start',
        });
      }}
    >
      {children}
    </a>
  );
}

export function LandingHeader() {
  const isScrolled = useSyncExternalStore(
    subscribeToScroll,
    getScrolledSnapshot,
    getServerSnapshot,
  );

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter,box-shadow] duration-300 ${
        isScrolled
          ? 'border-(--lifeops-border)/25 bg-(--lifeops-page)/10 shadow-sm backdrop-blur-xl'
          : 'border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <LandingTopLink className="inline-flex items-baseline tracking-[-0.04em]">
          <span className="font-title text-[20px] font-normal text-(--lifeops-fg)">Life</span>
          <span className="font-title text-[20px] font-bold text-(--lifeops-fg)">Ops</span>
        </LandingTopLink>

        <nav aria-label="Navegación principal" className="flex items-center gap-2 sm:gap-3 lg:gap-6">
          <LandingSectionLink targetId="how-it-works" className="hidden text-sm text-(--lifeops-muted) transition-colors hover:text-(--lifeops-fg) lg:inline">
            Cómo funciona
          </LandingSectionLink>
          <LandingSectionLink targetId="who-its-for" className="hidden text-sm text-(--lifeops-muted) transition-colors hover:text-(--lifeops-fg) lg:inline">
            Para quién es
          </LandingSectionLink>
          <LandingSectionLink
            targetId="contact"
            className="hidden h-10 items-center rounded-lg bg-[#FBDBAC] px-4 text-sm font-semibold text-[#1a1d24] transition-colors hover:bg-[#f5c98a] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/50 md:inline-flex"
          >
            Solicitar demo
          </LandingSectionLink>
          <Link
            href="/login"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome) px-3 text-sm font-medium text-(--lifeops-fg) transition-colors hover:border-(--lifeops-accent)/60 hover:bg-(--lifeops-hover) focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#FBDBAC]/40 sm:gap-2 sm:px-4"
          >
            Iniciar sesión <ArrowUpRight className="size-4" aria-hidden />
          </Link>
          <ThemeToggle className="size-10 rounded-lg border border-(--lifeops-border) bg-(--lifeops-chrome)" />
        </nav>
      </div>
    </header>
  );
}
