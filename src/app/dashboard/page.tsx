'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile) {
      // Redirect based on role
      if (profile.role === 'consultant') {
        router.push('/dashboard/policies');
      }
      // Promotory users stay on this page
    }
  }, [profile, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  // Only promotory users should see this
  if (profile?.role !== 'promotory') {
    return null;
  }

  return (
    <div>
      <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
        Dashboard
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Welcome to your LifeOps dashboard. Manage all your operations from here.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Quick Actions
          </h3>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Access frequently used tools and features
          </p>
          <a
            href="/dashboard/extractor"
            className="text-blue-600 dark:text-blue-400 hover:underline"
          >
            Go to Extractor →
          </a>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Recent Activity
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            View your recent operations and tasks
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            Statistics
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            Track your productivity and usage metrics
          </p>
        </div>
      </div>
    </div>
  );
}
