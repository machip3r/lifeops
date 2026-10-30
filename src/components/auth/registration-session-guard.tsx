'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { AuthCardSkeleton } from '@/components/ui/skeleton';

export function RegistrationSessionGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && session) router.replace('/dashboard');
  }, [loading, router, session]);

  if (loading || session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-gray-50 to-gray-100 px-4 dark:from-gray-900 dark:to-gray-800">
        <AuthCardSkeleton />
      </div>
    );
  }

  return children;
}
