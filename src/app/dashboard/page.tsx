'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { Consultant } from '@/lib/supabase';

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const [topConsultants, setTopConsultants] = useState<Array<{ consultant: Consultant; sales: number }>>([]);
  const [totalPrimaPago, setTotalPrimaPago] = useState(0);
  const [totalPrimaMeta, setTotalPrimaMeta] = useState(0);
  const [primaMetaVI, setPrimaMetaVI] = useState(0);
  const [primaMetaGM, setPrimaMetaGM] = useState(0);
  const [statsLoading, setStatsLoading] = useState(true);

  const loadDashboardStats = useCallback(async () => {
    if (!profile?.id || profile.role !== 'promotory') {
      setStatsLoading(false);
      return;
    }

    try {
      setStatsLoading(true);

      // Get totals and top consultants using SQL functions (all calculations done server-side)
      const [totals, topConsultants, totalsByType] = await Promise.all([
        db.dashboard.getOfficeTotals(profile.id),
        db.dashboard.getTopConsultantsBySales(profile.id, 3),
        db.dashboard.getOfficeTotalsByType(profile.id),
      ]);

      setTotalPrimaPago(totals.totalPrimaPago);
      setTotalPrimaMeta(totals.totalPrimaMeta);
      setPrimaMetaVI(totalsByType.primaMetaVI);
      setPrimaMetaGM(totalsByType.primaMetaGM);
      setTopConsultants(topConsultants);
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    if (!loading && profile) {
      // Redirect based on role
      if (profile.role === 'consultant') {
        router.push('/dashboard/policies');
      } else if (profile.role === 'promotory') {
        loadDashboardStats();
      }
    }
  }, [profile, loading, router, loadDashboardStats]);

  if (loading || statsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-600 dark:text-gray-400">Cargando...</p>
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
        Vista General
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">
        Bienvenido a tu vista general de LifeOps. Gestiona todas tus operaciones desde aquí.
      </p>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Total Prima Pago
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            ${totalPrimaPago.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Total Prima Meta
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            ${totalPrimaMeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Prima Meta by Contract Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Prima Meta - Seguro de Vida (VI)
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            ${primaMetaVI.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Prima Meta - Seguro de Gastos Mayores (GM)
          </h3>
          <p className="text-3xl font-bold text-gray-900 dark:text-white">
            ${primaMetaGM.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Top Consultants */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Asesores con más ventas
        </h3>
        {topConsultants.length > 0 ? (
          <div className="space-y-3">
            {topConsultants.map((item, index) => (
              <div
                key={item.consultant.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 cursor-pointer transition-colors"
                onClick={() => router.push(`/dashboard/consultants/${item.consultant.id}`)}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {item.consultant.name}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {item.consultant.consultant_code || 'Sin código'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900 dark:text-white">
                    ${item.sales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400">No hay datos de ventas disponibles</p>
        )}
      </div>
    </div>
  );
}
