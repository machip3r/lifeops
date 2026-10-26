import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommissionImport } from '@/lib/supabase';

/** `commissionImport` table access (RLS-scoped client: browser session or user JWT). */
export function createCommissionImportDb(supabase: SupabaseClient) {
    const commissionImportDb = {
        create: async (
            row: Omit<CommissionImport, 'id' | 'created_at' | 'updated_at' | 'status'> & {
                status?: CommissionImport['status'];
            },
        ): Promise<CommissionImport> => {
            const { data, error } = await supabase
                .from('commission_import')
                .insert({
                    ...row,
                    status: row.status ?? 'pending',
                })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        /** True when the batch exists and belongs to the office (RLS also hides other offices). */
        belongsToOffice: async (id: string, officeId: string): Promise<boolean> => {
            const { data, error } = await supabase
                .from('commission_import')
                .select('office_id')
                .eq('id', id)
                .maybeSingle();
            if (error) throw error;
            return data?.office_id === officeId;
        },

        update: async (id: string, updates: Partial<CommissionImport>): Promise<CommissionImport> => {
            const { data, error } = await supabase
                .from('commission_import')
                .update(updates)
                .eq('id', id)
                .select()
                .single();
            if (error) throw error;
            return data;
        },
    };

    return commissionImportDb;
}
