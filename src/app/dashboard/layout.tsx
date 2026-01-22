'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { assets } from '../theme/assets';
import { useAuth } from '@/contexts/auth-context';
import { useEffect, useState, useRef } from 'react';
import GlobalSearch from '@/components/global-search';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile, loading, session, signOut } = useAuth();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only redirect if we have no session (not logged in)
    // Don't redirect if we have a session but profile is still loading
    if (!loading && !session) {
      router.push('/login');
    }

    // If loading is complete, we have a session, but no profile after a delay,
    // the user might not have a profile - but don't auto-signout, let them see an error
    // This is handled by the profile check below
  }, [profile, loading, session, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show loading state only on initial load
  if (loading) {
    return (
      <div className="min-h-screen bg-[#1a1d24] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">Cargando...</p>
        </div>
      </div>
    );
  }

  // If no session, redirect to login (handled by useEffect)
  if (!session) {
    return (
      <div className="min-h-screen bg-[#1a1d24] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg">Redirigiendo al inicio de sesión...</p>
        </div>
      </div>
    );
  }

  // If we have a session but profile is still loading, show a message
  // Profile loads in background, so we can show a partial UI
  if (!profile) {
    return (
      <div className="min-h-screen bg-[#1a1d24] flex items-center justify-center">
        <div className="text-center">
          <p className="text-white text-lg mb-4">Cargando tu perfil...</p>
          <p className="text-[#FBDBAC] text-sm">Esto puede tomar un momento</p>
        </div>
      </div>
    );
  }

  // Navigation items based on role
  const promotoryNavItems = [
    { href: '/dashboard', label: 'Vista General' },
    { href: '/dashboard/extractor', label: 'Subir Comisiones' },
    { href: '/dashboard/contracts', label: 'Pólizas' },
    { href: '/dashboard/clients', label: 'Contratantes' },
    { href: '/dashboard/consultants', label: 'Asesores' },
    { href: '/dashboard/change-requests', label: 'Solicitudes de Cambio' },
    { href: '/dashboard/projection', label: 'Proyección' },
  ];

  const consultantNavItems = [
    { href: '/dashboard/contracts', label: 'Pólizas' },
    { href: '/dashboard/change-requests', label: 'Solicitudes de Cambio' },
    { href: '/dashboard/clients', label: 'Contratantes' },
    { href: '/dashboard/projection', label: 'Proyección' },
  ];

  const navItems = profile.role === 'promotory' ? promotoryNavItems : consultantNavItems;
  const currentNavItem = navItems.find(item => pathname === item.href) || navItems[0];
  const isProfilePage = pathname === '/dashboard/profile';

  return (
    <div className="min-h-screen bg-[#1a1d24]">
      {/* Navigation Bar */}
      <nav className="bg-[#242830] shadow-md border-b border-[#2a2f38]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-white">
                {assets.brand.name}
              </Link>
            </div>

            {/* Search */}
            <div className="flex items-center flex-1 mx-4 max-w-md">
              <GlobalSearch />
            </div>

            {/* Right side: Menu, Profile, Logout */}
            <div className="flex items-center space-x-3">
              {/* Navigation Menu Dropdown */}
              <div ref={menuRef} className="relative">
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  className={`flex items-center space-x-2 rounded-lg text-white hover:bg-[#2f3540] transition-colors ${
                    isProfilePage ? 'p-2' : 'px-4 py-2 text-sm font-medium'
                  }`}
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                  {!isProfilePage && <span className="hidden sm:inline">{currentNavItem.label}</span>}
                </button>

                {menuOpen && (
                  <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                    {navItems.map((item) => {
                      const isActive = pathname === item.href;
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          onClick={() => setMenuOpen(false)}
                          className={`block px-4 py-2 text-sm transition-colors ${isActive
                              ? 'bg-[#FBDBAC]/20 text-[#FBDBAC] font-medium'
                              : 'text-white hover:bg-[#2f3540]'
                            }`}
                        >
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Profile Icon */}
              <Link
                href="/dashboard/profile"
                className="p-2 rounded-lg text-white hover:bg-[#2f3540] transition-colors"
                title="Perfil"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </Link>

              {/* Logout Icon */}
              <button
                onClick={signOut}
                className="p-2 rounded-lg text-red-400 hover:bg-red-900/20 transition-colors"
                title="Cerrar Sesión"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

