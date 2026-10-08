'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { ConsultantHome } from '@/components/dashboard/consultant-home';
import { CollectionPriorityLists } from '@/components/dashboard/collection-priority-lists';
import { PageHeader } from '@/components/dashboard/page-header';
import {
  PENDING_PAYMENT_WITHIN_DAYS,
  POLICY_AT_RISK_DAYS,
} from '@/lib/collections/constants';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import { useQueryEffect, useQueryLoading } from '@/hooks/use-query-effect';

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const [priorityLoading, setPriorityLoading] = useQueryLoading(
    profile?.role === 'promotory' ? profile.id : '',
  );
  const [atRisk, setAtRisk] = useState<ContractAtRisk[]>([]);
  const [pendingPayments, setPendingPayments] = useState<ContractPendingPayment[]>([]);

  const loadPriorityLists = useCallback(async () => {
    if (!profile?.id || profile.role !== 'promotory') {
      setPriorityLoading(false);
      return;
    }
    try {
      const [riskRows, pendingRows] = await Promise.all([
        db.dashboard.listContractsAtRisk({
          officeId: profile.id,
          riskDays: POLICY_AT_RISK_DAYS,
        }),
        db.dashboard.listContractsPendingPayment({
          officeId: profile.id,
          withinDays: PENDING_PAYMENT_WITHIN_DAYS,
        }),
      ]);
      setAtRisk(riskRows);
      setPendingPayments(pendingRows);
    } catch (e) {
      console.error('Error loading priority lists:', e);
    } finally {
      setPriorityLoading(false);
    }
  }, [profile?.id, profile?.role, setPriorityLoading]);

  useQueryEffect(!loading && profile?.role === 'promotory', loadPriorityLists);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <p className="text-[#9ca3af]">Cargando...</p>
      </div>
    );
  }

  if (profile?.role === 'consultant') {
    return <ConsultantHome />;
  }

  if (profile?.role !== 'promotory') {
    return null;
  }

  return (
    <div>
      <PageHeader
        title="Vista general"
        watermark="Vista general"
        description="Prioriza cobranza y recordatorios de tu promotoría."
      />

      <div className="mb-10 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-(--lifeops-fg)">
            Prioridad de cobranza
          </h2>
          <Link
            href="/dashboard/collections"
            className="text-sm text-[#FBDBAC] underline-offset-2 hover:underline"
          >
            Ir a cobranza
          </Link>
        </div>
        {priorityLoading ? (
          <p className="text-[#9ca3af] text-center py-8">Cargando prioridades…</p>
        ) : (
          <CollectionPriorityLists
            atRisk={atRisk}
            pending={pendingPayments}
            showConsultant
          />
        )}
      </div>
    </div>
  );
}
