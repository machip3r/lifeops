'use client';

import { useState } from 'react';
import { deleteClientAction } from '@/app/dashboard/clients/actions';
import { deleteContractAction } from '@/app/dashboard/contracts/actions';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useToast } from '@/components/toast';
import { useAuth } from '@/contexts/auth-context';
import { authFetch } from '@/lib/api-client';

/** Shared state: one confirm at a time, busy flag, toast on failure. */
function useDelete(run: (token: string) => Promise<{ ok: boolean; error?: string }>, success: string, onDeleted: () => void) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const confirm = async () => {
    if (!session?.access_token) {
      toast.error('Tu sesión expiró. Vuelve a iniciar sesión.');
      return;
    }
    setBusy(true);
    try {
      const result = await run(session.access_token);
      if (!result.ok) {
        toast.error(result.error ?? 'No se pudo eliminar.');
        return;
      }
      toast.success(success);
      onDeleted();
    } catch (error) {
      console.error('delete failed:', error);
      toast.error('No se pudo eliminar. Intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };
  return { busy, confirm };
}

const pluralPolizas = (n: number) => (n === 1 ? '1 póliza' : `${n} pólizas`);

/** Póliza: only the póliza goes (with its recibos, pagos and documentos). */
export function DeleteContractDialog({
  contract,
  onClose,
  onDeleted,
}: {
  contract: { id: string; contractNumber: string | null } | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, confirm } = useDelete(
    (token) => deleteContractAction(token, { contractId: contract?.id }),
    'Póliza eliminada.',
    () => {
      onClose();
      onDeleted();
    },
  );
  return (
    <ConfirmDialog
      open={contract != null}
      title={`¿Eliminar la póliza ${contract?.contractNumber ?? ''}?`.replace(' ?', '?')}
      description={
        'Se borrarán también sus recibos importados, los pagos registrados en cobranza y sus documentos.\n\nEl cliente y el asesor no se borran. Esta acción no se puede deshacer.'
      }
      confirmLabel="Sí, eliminar póliza"
      loadingLabel="Eliminando…"
      loading={busy}
      onCancel={() => (busy ? undefined : onClose())}
      onConfirm={() => void confirm()}
    />
  );
}

/** Cliente: its pólizas in the office go with it. */
export function DeleteClientDialog({
  client,
  onClose,
  onDeleted,
}: {
  client: { id: string; name: string; contractCount: number } | null;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, confirm } = useDelete(
    (token) => deleteClientAction(token, { clientId: client?.id }),
    'Cliente eliminado.',
    () => {
      onClose();
      onDeleted();
    },
  );
  const n = client?.contractCount ?? 0;
  return (
    <ConfirmDialog
      open={client != null}
      title={`¿Eliminar a ${client?.name ?? 'este cliente'}?`}
      description={
        n > 0
          ? `También se eliminarán sus ${pluralPolizas(n)}, con sus recibos, pagos registrados y documentos.\n\nEsta acción no se puede deshacer.`
          : 'No tiene pólizas registradas. Esta acción no se puede deshacer.'
      }
      confirmLabel={n > 0 ? `Sí, eliminar cliente y ${pluralPolizas(n)}` : 'Sí, eliminar cliente'}
      loadingLabel="Eliminando…"
      loading={busy}
      onCancel={() => (busy ? undefined : onClose())}
      onConfirm={() => void confirm()}
    />
  );
}

/** Asesor (promotoría): its pólizas and its LifeOps access go with it. */
export function DeleteConsultantDialog({
  consultant,
  officeId,
  onClose,
  onDeleted,
}: {
  /** `countIsActiveOnly`: the list only knows active pólizas */
  consultant: { id: string; name: string; contractCount: number; countIsActiveOnly?: boolean } | null;
  officeId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { busy, confirm } = useDelete(
    async () => {
      const response = await authFetch('/api/consultants/delete', {
        method: 'POST',
        body: JSON.stringify({ consultantId: consultant?.id, officeId, forceDelete: true, withContracts: true }),
      });
      const data = await response.json().catch(() => ({}));
      return response.ok ? { ok: true } : { ok: false, error: data.error || 'No se pudo eliminar el asesor.' };
    },
    'Asesor eliminado.',
    () => {
      onClose();
      onDeleted();
    },
  );
  const n = consultant?.contractCount ?? 0;
  return (
    <ConfirmDialog
      open={consultant != null}
      title={`¿Eliminar a ${consultant?.name ?? 'este asesor'}?`}
      description={`${
        n > 0
          ? `También se eliminarán todas sus pólizas (${pluralPolizas(n)}${consultant?.countIsActiveOnly ? ' activas, más las inactivas' : ''}), con sus recibos, pagos registrados y documentos. Sus clientes se quedan.`
          : 'No tiene pólizas registradas.'
      }\n\nPerderá su acceso a LifeOps. Esta acción no se puede deshacer.`}
      confirmLabel={n > 0 ? 'Sí, eliminar asesor y sus pólizas' : 'Sí, eliminar asesor'}
      loadingLabel="Eliminando…"
      loading={busy}
      onCancel={() => (busy ? undefined : onClose())}
      onConfirm={() => void confirm()}
    />
  );
}
