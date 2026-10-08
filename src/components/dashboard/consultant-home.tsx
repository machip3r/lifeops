'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  PENDING_PAYMENT_WITHIN_DAYS,
  POLICY_AT_RISK_DAYS,
} from '@/lib/collections/constants';
import { CollectionPriorityLists } from '@/components/dashboard/collection-priority-lists';
import { useQueryEffect, useQueryLoading } from '@/hooks/use-query-effect';

/** Asesor home: at-risk + pending payments + shortcuts. */
export function ConsultantHome() {
  const { profile, loading: authLoading } = useAuth();
  const [loading, setLoading] = useQueryLoading(
    profile?.role === 'consultant' ? profile.id : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [atRisk, setAtRisk] = useState<ContractAtRisk[]>([]);
  const [pending, setPending] = useState<ContractPendingPayment[]>([]);

  const load = useCallback(async () => {
    if (!profile?.id || profile.role !== 'consultant') return;
    try {
      const consultant = await db.consultant.getConsultantById(profile.id);
      if (!consultant) {
        setError('No se encontró tu perfil de asesor.');
        setAtRisk([]);
        setPending([]);
        return;
      }
      const [riskRows, pendingRows] = await Promise.all([
        db.dashboard.listContractsAtRisk({
          consultantId: consultant.id,
          riskDays: POLICY_AT_RISK_DAYS,
        }),
        db.dashboard.listContractsPendingPayment({
          consultantId: consultant.id,
          withinDays: PENDING_PAYMENT_WITHIN_DAYS,
        }),
      ]);
      setError(null);
      setAtRisk(riskRows);
      setPending(pendingRows);
    } catch (e) {
      console.error(e);
      setError(
        e instanceof Error
          ? e.message
          : 'No se pudo cargar tu resumen de cobranza.',
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, profile?.role, setLoading]);

  useQueryEffect(!authLoading && profile?.role === 'consultant', load);

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando…</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Vista general"
        watermark="Vista general"
        description="Revisa pólizas en peligro y pagos pendientes de registrar."
      />

      {error && (
        <p className="text-center text-red-400" role="alert">
          {error}
        </p>
      )}

      <CollectionPriorityLists atRisk={atRisk} pending={pending} />
    </div>
  );
}
