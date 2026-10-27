'use client';

import type { Client } from '@/lib/supabase';
import { useAuth } from '@/contexts/auth-context';
import { updateClientAction } from '@/app/dashboard/clients/actions';
import { ClientFormDialog } from '@/components/clients/client-form-dialog';

/** Full client edit (Server Action + `client.update` audit). */
export function EditClientDialog({
  open,
  client,
  onClose,
  onSaved,
}: {
  open: boolean;
  client: Client | null;
  onClose: () => void;
  onSaved: (next: Client) => void;
}) {
  const { session } = useAuth();
  return (
    <ClientFormDialog
      open={open && client != null}
      editingClient={client}
      onClose={onClose}
      onSubmit={async (data) => {
        if (!client) return;
        if (!session?.access_token) return { error: 'Tu sesión expiró. Vuelve a iniciar sesión.' };
        const result = await updateClientAction(session.access_token, {
          clientId: client.id,
          name: data.name,
          birthDate: data.date_of_birth,
          curp: data.curp,
          rfc: data.rfc,
          phone: data.phone,
          email: data.email,
        });
        if (!result.ok) return { error: result.error, fieldErrors: 'fieldErrors' in result ? result.fieldErrors : undefined };
        onSaved(result.data);
        onClose();
      }}
    />
  );
}
