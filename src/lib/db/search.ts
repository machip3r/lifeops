import type { SupabaseClient } from '@supabase/supabase-js';
import type { Client, Consultant, Contract } from '@/lib/supabase';

/** `search` table access (RLS-scoped client: browser session or user JWT). */
export function createSearchDb(supabase: SupabaseClient) {
    const searchDb = {
        searchContracts: async (query: string, officeId?: string): Promise<Contract[]> => {
            let queryBuilder = supabase
                .from('contract')
                .select('*')
                .or(`contract_number.ilike.%${query}%,project_name.ilike.%${query}%`)
                .limit(10);

            if (officeId) {
                queryBuilder = queryBuilder.eq('office_id', officeId);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            return data || [];
        },

        searchConsultants: async (query: string, officeId?: string): Promise<Consultant[]> => {
            let queryBuilder = supabase
                .from('consultant')
                .select('*')
                .or(`name.ilike.%${query}%,consultant_code.ilike.%${query}%,email.ilike.%${query}%`)
                .limit(10);

            if (officeId) {
                queryBuilder = queryBuilder.eq('office_id', officeId);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            return data || [];
        },

        searchClients: async (query: string, officeId?: string): Promise<Client[]> => {
            let queryBuilder = supabase
                .from('client')
                .select('*')
                .ilike('name', `%${query}%`)
                .limit(10);

            // If officeId is provided, filter by contracts that belong to that office
            if (officeId) {
                // Get clients through contracts
                const { data: contracts, error: contractError } = await supabase
                    .from('contract')
                    .select('client_id, consultant:consultant_id(office_id)')
                    .eq('consultant.office_id', officeId)
                    .not('client_id', 'is', null);

                if (contractError) throw contractError;

                const clientIds = contracts
                    ?.map((c: any) => c.client_id)
                    .filter((id: string | null): id is string => id !== null) || [];

                if (clientIds.length === 0) return [];

                queryBuilder = queryBuilder.in('id', clientIds);
            }

            const { data, error } = await queryBuilder;

            if (error) throw error;
            return data || [];
        },
    };

    return searchDb;
}
