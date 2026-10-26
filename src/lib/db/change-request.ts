import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractChangeRequest } from '@/lib/supabase';
import { emptyPageResult, normalizePageParams, toRange, type PageParams, type PageResult, type SortOrder } from '@/lib/pagination';
import { createContractDb } from './contract';

/** `contractChangeRequest` table access (RLS-scoped client: browser session or user JWT). */
export function createContractChangeRequestDb(supabase: SupabaseClient) {
    const contractDb = createContractDb(supabase);

    const contractChangeRequestDb = {
        getChangeRequestById: async (id: string): Promise<ContractChangeRequest | null> => {
            const { data, error } = await supabase
                .from('contract_change_request')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getChangeRequestsPage: async (
            opts: {
                officeId?: string;
                consultantId?: string;
                sort?: SortOrder;
            } & Partial<PageParams> = {},
        ): Promise<
            PageResult<
                ContractChangeRequest & {
                    contract_number?: string | null;
                }
            >
        > => {
            const { page, pageSize } = normalizePageParams(opts);
            const { from, to } = toRange(page, pageSize);

            let contractIds: string[] = [];
            if (opts.consultantId) {
                const contracts = await contractDb.getContractsByConsultant(opts.consultantId);
                contractIds = contracts.map((c) => c.id);
            } else if (opts.officeId) {
                const contracts = await contractDb.getContractsByOffice(opts.officeId);
                contractIds = contracts.map((c) => c.id);
            }

            if (contractIds.length === 0) {
                return emptyPageResult(opts);
            }

            const allowedSort = [
                'request_type',
                'folio_number',
                'details',
                'status',
                'created_at',
            ];
            const sortCol =
                opts.sort?.column && allowedSort.includes(opts.sort.column)
                    ? opts.sort.column
                    : 'created_at';
            const ascending = opts.sort?.ascending ?? false;

            const { data, error, count } = await supabase
                .from('contract_change_request')
                .select('*, contract:contract_id(contract_number)', { count: 'exact' })
                .in('contract_id', contractIds)
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (error) throw error;

            const rows = (data || []).map((item: any) => {
                const { contract, ...cr } = item;
                return {
                    ...cr,
                    contract_number: contract?.contract_number ?? null,
                } as ContractChangeRequest & { contract_number?: string | null };
            });

            return { rows, total: count ?? 0, page, pageSize };
        },

        createChangeRequest: async (changeRequest: Omit<ContractChangeRequest, 'id' | 'created_at' | 'updated_at'>): Promise<ContractChangeRequest> => {
            const { data, error } = await supabase
                .from('contract_change_request')
                .insert(changeRequest)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        updateChangeRequest: async (id: string, updates: Partial<ContractChangeRequest>): Promise<ContractChangeRequest> => {
            const { data, error } = await supabase
                .from('contract_change_request')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },
    };

    return contractChangeRequestDb;
}
