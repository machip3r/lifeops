import type { Consultant } from '@/lib/supabase';

export type ConsultantStatus = Consultant['status'];

/** Access status of an asesor (invitation / LifeOps account): label + dot color. */
export const CONSULTANT_STATUS: Record<ConsultantStatus, { label: string; color: string }> = {
  ACTIVE: { label: 'Activo', color: 'var(--viz-current)' },
  PENDING: { label: 'Invitación pendiente', color: 'var(--viz-due-soon)' },
  NOT_INVITED: { label: 'Sin invitar', color: 'var(--lifeops-accent)' },
  INACTIVE: { label: 'Inactivo', color: 'var(--viz-last-year)' },
};
