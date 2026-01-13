'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { assets } from '../theme/assets';
import { useAuth } from '@/contexts/auth-context';
import { useEffect } from 'react';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { profile, loading, session, signOut } = useAuth();
  const router = useRouter();

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

  // Show loading state only on initial load
  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Loading...</p>
        </div>
      </div>
    );
  }

  // If no session, redirect to login (handled by useEffect)
  if (!session) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  // If we have a session but profile is still loading, show a message
  // Profile loads in background, so we can show a partial UI
  if (!profile) {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 dark:text-gray-400 text-lg mb-4">Loading your profile...</p>
          <p className="text-gray-500 dark:text-gray-500 text-sm">This may take a moment</p>
        </div>
      </div>
    );
  }

  // Navigation items based on role
  const promotoryNavItems = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/extractor', label: 'Extractor' },
    { href: '/dashboard/contracts', label: 'Contracts' },
    { href: '/dashboard/consultants', label: 'Consultants' },
    { href: '/dashboard/change-requests', label: 'Requests' },
    { href: '/dashboard/profile', label: 'Profile' },
  ];

  const consultantNavItems = [
    { href: '/dashboard/contracts', label: 'Contracts' },
    { href: '/dashboard/change-requests', label: 'Requests' },
    { href: '/dashboard/clients', label: 'Clients' },
    { href: '/dashboard/profile', label: 'Profile' },
  ];

  const navItems = profile.role === 'promotory' ? promotoryNavItems : consultantNavItems;

  return (
    <div className="min-h-screen bg-linear-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      {/* Navigation Bar */}
      <nav className="bg-white dark:bg-gray-800 shadow-md border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <Link href="/" className="text-2xl font-bold text-gray-900 dark:text-white">
                {assets.brand.name}
              </Link>
            </div>
            <div className="flex items-center space-x-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <button
                onClick={signOut}
                className="ml-4 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                Sign Out
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

