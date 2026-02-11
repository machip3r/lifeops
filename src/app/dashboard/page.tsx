'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { Consultant } from '@/lib/supabase';

function getCurrentMonthStartEnd(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    start: `${y}-${m}-01`,
    end: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  const { start: defaultStart, end: defaultEnd } = getCurrentMonthStartEnd();
  const [dateStart, setDateStart] = useState(defaultStart);
  const [dateEnd, setDateEnd] = useState(defaultEnd);
  const [pendingDateStart, setPendingDateStart] = useState(defaultStart);
  const [pendingDateEnd, setPendingDateEnd] = useState(defaultEnd);
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

      const [totals, topConsultants, totalsByType] = await Promise.all([
        db.dashboard.getOfficeTotals(profile.id, dateStart, dateEnd),
        db.dashboard.getTopConsultantsBySales(profile.id, 3, dateStart, dateEnd),
        db.dashboard.getOfficeTotalsByType(profile.id, dateStart, dateEnd),
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
  }, [profile?.id, profile?.role, dateStart, dateEnd]);

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
      <h1 className="text-4xl font-bold text-white mb-2">
        Vista General
      </h1>
      <p className="text-[#FBDBAC] mb-4">
        Bienvenido a tu vista general de LifeOps. Los datos se filtran por fecha de pago (prima).
      </p>

      {/* Date range filter — apply with button to avoid query on every change */}
      <div className="flex flex-wrap items-center gap-4 mb-8 p-4 bg-[#2a2f38] rounded-lg border border-[#3a4049]">
        <span className="text-sm font-medium text-[#FBDBAC]">Rango de fechas (fecha de pago):</span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Desde</span>
            <input
              type="date"
              value={pendingDateStart}
              onChange={(e) => setPendingDateStart(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#242830] border border-[#3a4049] text-white text-sm focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
            />
          </label>
          <label className="flex items-center gap-2">
            <span className="text-sm text-gray-300">Hasta</span>
            <input
              type="date"
              value={pendingDateEnd}
              onChange={(e) => setPendingDateEnd(e.target.value)}
              className="px-3 py-2 rounded-lg bg-[#242830] border border-[#3a4049] text-white text-sm focus:ring-2 focus:ring-[#FBDBAC] focus:border-transparent"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              const { start, end } = getCurrentMonthStartEnd();
              setPendingDateStart(start);
              setPendingDateEnd(end);
            }}
            className="px-3 py-2 text-sm font-medium text-[#FBDBAC] hover:text-white hover:bg-[#3a4049] rounded-lg transition-colors"
          >
            Mes actual
          </button>
          <button
            type="button"
            onClick={() => {
              setDateStart(pendingDateStart);
              setDateEnd(pendingDateEnd);
            }}
            className="px-4 py-2 text-sm font-medium text-[#242830] bg-[#FBDBAC] hover:bg-[#f5d08c] rounded-lg transition-colors"
          >
            Aplicar
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#2a2f38] rounded-lg shadow-lg p-6 border border-[#3a4049]">
          <h3 className="text-lg font-semibold text-[#FBDBAC] mb-2">
            Total Prima Pago
          </h3>
          <p className="text-3xl font-bold text-white">
            ${totalPrimaPago.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-[#2a2f38] rounded-lg shadow-lg p-6 border border-[#3a4049]">
          <h3 className="text-lg font-semibold text-[#FBDBAC] mb-2">
            Total Prima Meta
          </h3>
          <p className="text-3xl font-bold text-white">
            ${totalPrimaMeta.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Prima Meta by Contract Type */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-[#2a2f38] rounded-lg shadow-lg p-6 border border-[#3a4049]">
          <h3 className="text-lg font-semibold text-[#FBDBAC] mb-2">
            Prima Meta - Seguro de Vida (VI)
          </h3>
          <p className="text-3xl font-bold text-white">
            ${primaMetaVI.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="bg-[#2a2f38] rounded-lg shadow-lg p-6 border border-[#3a4049]">
          <h3 className="text-lg font-semibold text-[#FBDBAC] mb-2">
            Prima Meta - Seguro de Gastos Mayores (GM)
          </h3>
          <p className="text-3xl font-bold text-white">
            ${primaMetaGM.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Top Consultants */}
      <div className="bg-[#2a2f38] rounded-lg shadow-lg p-6 border border-[#3a4049]">
        <h3 className="text-xl font-semibold text-white mb-4">
          Asesores con más ventas
        </h3>
        {topConsultants.length > 0 ? (
          <div className="space-y-3">
            {topConsultants.map((item, index) => (
              <div
                key={item.consultant.id}
                className="flex items-center justify-between p-3 bg-[#242830] rounded-lg hover:bg-[#2f3540] cursor-pointer transition-colors border border-[#3a4049]"
                onClick={() => router.push(`/dashboard/consultants/${item.consultant.id}`)}
              >
                <div className="flex items-center space-x-3">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-[#FBDBAC] text-black font-bold text-sm">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-white">
                      {item.consultant.name}
                    </p>
                    <p className="text-sm text-[#FBDBAC]">
                      {item.consultant.consultant_code || 'Sin código'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">
                    ${item.sales.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[#FBDBAC]">No hay datos de ventas disponibles</p>
        )}
      </div>
    </div>
  );
}
