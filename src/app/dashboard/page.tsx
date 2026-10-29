'use client';

import { useState, useCallback } from 'react';
import { useAuth } from '@/contexts/auth-context';
import { db } from '@/lib/db';
import { ConsultantHome } from '@/components/dashboard/consultant-home';
import { CollectionPriorityLists } from '@/components/dashboard/collection-priority-lists';
import { PageHeader } from '@/components/dashboard/page-header';
import { CollectionOverview } from '@/components/dashboard/overview/collection-overview';
import { GettingStarted } from '@/components/dashboard/getting-started';
import { useContractCount } from '@/hooks/use-contract-count';
import {
  PENDING_PAYMENT_WITHIN_DAYS,
  POLICY_AT_RISK_DAYS,
} from '@/lib/collections/constants';
import type { ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';
import { useQueryEffect, useQueryLoading } from '@/hooks/use-query-effect';
import { CardSkeleton, OverviewSkeleton, PageHeaderSkeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { profile, loading } = useAuth();
  const officeId = profile?.role === 'promotory' ? profile.id : '';
  const [priorityLoading, setPriorityLoading] = useQueryLoading(officeId);
  const [atRisk, setAtRisk] = useState<ContractAtRisk[]>([]);
  const [pendingPayments, setPendingPayments] = useState<ContractPendingPayment[]>([]);
  const cartera = useContractCount({ officeId }, !loading);

  const loadPriorityLists = useCallback(async () => {
    if (!officeId) {
      setPriorityLoading(false);
      return;
    }
    try {
      const [riskRows, pendingRows] = await Promise.all([
        db.dashboard.listContractsAtRisk({
          officeId,
          riskDays: POLICY_AT_RISK_DAYS,
        }),
        db.dashboard.listContractsPendingPayment({
          officeId,
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
  }, [officeId, setPriorityLoading]);

  useQueryEffect(!loading && Boolean(officeId), loadPriorityLists);

  if (loading) {
    return (
      <>
        <PageHeaderSkeleton />
        <OverviewSkeleton />
      </>
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
        description="Cartera y cobranza de tu promotoría de un vistazo."
      />

      {cartera.count === 0 ? (
        <GettingStarted
          context="overview"
          onRegistered={() => {
            void cartera.reload();
            void loadPriorityLists();
          }}
        />
      ) : (
        <>
          <CollectionOverview scope={{ officeId: profile.id }} />

          <div className="mt-4 mb-10">
            {priorityLoading ? (
              <CardSkeleton lines={6} />
            ) : (
              <CollectionPriorityLists
                atRisk={atRisk}
                pending={pendingPayments}
                showConsultant
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
