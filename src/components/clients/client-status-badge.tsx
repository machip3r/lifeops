import { CarteraStatusBadge } from '@/components/collections/cartera-status-badge';
import { DotBadge } from '@/components/ui/dot-badge';
import type { ClientCarteraStatus } from '@/lib/supabase';

/** Most critical cartera status of a client's pólizas; `none` = no active póliza. */
export function ClientStatusBadge({
  status,
  daysOverdue,
}: {
  status: ClientCarteraStatus;
  daysOverdue?: number | null;
}) {
  if (status === 'none') return <DotBadge label="Sin póliza activa" color="var(--lifeops-muted)" />;
  return <CarteraStatusBadge status={status} daysOverdue={daysOverdue} />;
}
