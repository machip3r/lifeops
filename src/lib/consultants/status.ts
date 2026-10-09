import type { Consultant } from '@/lib/supabase';

export type ConsultantStatus = Consultant['status'];

export const CONSULTANT_STATUS_LABEL: Record<ConsultantStatus, string> = {
  NOT_INVITED: 'Sin invitar',
  PENDING: 'Pendiente',
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
};

export function consultantStatusClass(status: string | null | undefined): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300';
    case 'PENDING':
      return 'bg-amber-500/15 text-amber-800 dark:text-amber-200';
    case 'NOT_INVITED':
      return 'bg-[#FBDBAC]/25 text-(--lifeops-fg)';
    default:
      return 'bg-(--lifeops-hover) text-(--lifeops-muted)';
  }
}
