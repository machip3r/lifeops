'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth, UserRole } from '@/contexts/auth-context';
import { ListPageSkeleton } from '@/components/ui/skeleton';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export default function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!profile) {
        router.push('/login');
        return;
      }

      if (allowedRoles && !allowedRoles.includes(profile.role)) {
        // Redirect based on role
        if (profile.role === 'consultant') {
          router.push('/dashboard/contracts');
        } else {
          router.push('/dashboard');
        }
      }
    }
  }, [profile, loading, allowedRoles, router]);

  if (loading) {
    return (
      <ListPageSkeleton />
    );
  }

  if (!profile) {
    return null;
  }

  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    return null;
  }

  return <>{children}</>;
}

