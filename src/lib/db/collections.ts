import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionBoard, ContractCollectionPayment } from '@/lib/supabase';
import {
    syncPaymentsFromImportedDetailsBatch,
    writeImportSyncAudit,
} from './collections-service';

/** Cobranza reads + import sync (RLS-scoped client: browser session or user JWT). */
export function createCollectionsDb(supabase: SupabaseClient) {
    const collectionsDb = {
        /** Cobranza board: active pólizas with next receipt, status, contact and asesor (`list_collection_board`). */
        listBoard: async (opts: {
            officeId?: string;
            consultantId?: string;
            riskDays: number;
            dueSoonDays: number;
        }): Promise<CollectionBoard> => {
            const { data, error } = await supabase.rpc('list_collection_board', {
                office_id_param: opts.officeId ?? null,
                consultant_id_param: opts.consultantId ?? null,
                risk_days: opts.riskDays,
                due_soon_days: opts.dueSoonDays,
            });
            if (error) throw error;
            return data as CollectionBoard;
        },

        /** Paid cobranza marks of one póliza (manual + synced from commission files), newest first. */
        listContractPayments: async (contractId: string): Promise<ContractCollectionPayment[]> => {
            const { data, error } = await supabase
                .from('contract_collection_payment')
                .select('*')
                .eq('contract_id', contractId)
                .not('paid_at', 'is', null)
                .order('paid_at', { ascending: false });
            if (error) throw error;
            return (data ?? []) as ContractCollectionPayment[];
        },

        syncPaymentsFromImportedDetails: (
            input: Parameters<typeof syncPaymentsFromImportedDetailsBatch>[1],
        ) => syncPaymentsFromImportedDetailsBatch(supabase, input),

        writeImportSyncAudit: (input: Parameters<typeof writeImportSyncAudit>[1]) =>
            writeImportSyncAudit(supabase, input),
    };

    return collectionsDb;
}
