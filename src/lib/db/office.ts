import type { SupabaseClient } from '@supabase/supabase-js';
import type { Office } from '@/lib/supabase';

/** `office` table access (RLS-scoped client: browser session or user JWT). */
export function createOfficeDb(supabase: SupabaseClient) {
    const officeDb = {
        getOfficeById: async (id: string): Promise<Office | null> => {
            const { data, error } = await supabase
                .from('office')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        /** `name` may be null: signup asks only correo + contraseña; onboarding fills it. */
        createOffice: async (user_id: string, email: string, name: string | null): Promise<void> => {
            const { error } = await supabase.rpc('create_office', {
                user_id,
                user_email: email,
                office_name: name,
            });

            if (error) throw error;
        },

        updateOffice: async (id: string, updates: Partial<Office>): Promise<void> => {
            const { error } = await supabase
                .from('office')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
    };

    return officeDb;
}
