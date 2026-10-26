import type { SupabaseClient } from '@supabase/supabase-js';
import type { ContractDetail } from '@/lib/supabase';
import { chunkArray, IMPORT_BATCH_SIZE } from '@/lib/extractor/batch';
import { planDetailWrites } from '@/lib/extractor/receipt';
import { normalizePageParams, toRange, type PageParams, type PageResult, type SortOrder } from '@/lib/pagination';

/** One commission row ready to store (`contract_detail` without generated columns). */
export type ImportedDetail = Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>;

/** `contractDetail` table access (RLS-scoped client: browser session or user JWT). */
export function createContractDetailDb(supabase: SupabaseClient) {
    const contractDetailDb = {
        getDetailsByContract: async (contractId: string): Promise<ContractDetail[]> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .select('*')
                .eq('contract_id', contractId)
                .order('payment_date', { ascending: false, nullsFirst: false });

            if (error) throw error;
            return data || [];
        },

        getDetailsByContractPage: async (
            contractId: string,
            params: Partial<PageParams> & { sort?: SortOrder } = {},
        ): Promise<PageResult<ContractDetail>> => {
            const { page, pageSize } = normalizePageParams(params);
            const { from, to } = toRange(page, pageSize);
            const sortCol =
                params.sort?.column &&
                    ['payment_date', 'issue_date', 'premium_payment', 'created_at'].includes(
                        params.sort.column,
                    )
                    ? params.sort.column
                    : 'payment_date';
            const ascending = params.sort?.ascending ?? false;

            const { data, error, count } = await supabase
                .from('contract_detail')
                .select('*', { count: 'exact' })
                .eq('contract_id', contractId)
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (error) throw error;
            return {
                rows: (data as ContractDetail[]) || [],
                total: count ?? 0,
                page,
                pageSize,
            };
        },

        /** For Cobranza: details with contract number and client name. RLS filters by office/consultant. */
        getDetailsWithContractAndClient: async (): Promise<Array<ContractDetail & { contract_number?: string | null; client_name?: string | null }>> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .select(`
                    id,
                    contract_id,
                    payment_date,
                    premium_payment,
                    payment_method,
                    contract:contract_id(
                        contract_number,
                        client:client_id(name)
                    )
                `)
                .order('payment_date', { ascending: false, nullsFirst: false });

            if (error) throw error;
            if (!data) return [];

            return data.map((row: any) => {
                const { contract, ...detail } = row;
                const contractNumber = contract?.contract_number ?? null;
                const clientName = contract?.client?.name ?? null;
                return {
                    ...detail,
                    contract_number: contractNumber,
                    client_name: clientName,
                } as ContractDetail & { contract_number?: string | null; client_name?: string | null };
            });
        },

        getDetailsWithContractAndClientPage: async (
            params: Partial<PageParams> & {
                dueByEndOfMonth?: boolean;
                sort?: SortOrder;
            } = {},
        ): Promise<
            PageResult<
                ContractDetail & {
                    contract_number?: string | null;
                    client_name?: string | null;
                }
            >
        > => {
            const { page, pageSize } = normalizePageParams(params);
            const { from, to } = toRange(page, pageSize);
            const sortCol =
                params.sort?.column &&
                    ['payment_date', 'premium_payment', 'payment_method'].includes(
                        params.sort.column,
                    )
                    ? params.sort.column
                    : 'payment_date';
            const ascending = params.sort?.ascending ?? false;

            let query = supabase
                .from('contract_detail')
                .select(
                    `
                    id,
                    contract_id,
                    payment_date,
                    premium_payment,
                    payment_method,
                    contract:contract_id(
                        contract_number,
                        client:client_id(name)
                    )
                `,
                    { count: 'exact' },
                )
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (params.dueByEndOfMonth) {
                const now = new Date();
                const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                const endIso = end.toISOString().slice(0, 10);
                query = query.lte('payment_date', endIso);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            const rows = (data || []).map((row: any) => {
                const { contract, ...detail } = row;
                return {
                    ...detail,
                    contract_number: contract?.contract_number ?? null,
                    client_name: contract?.client?.name ?? null,
                } as ContractDetail & {
                    contract_number?: string | null;
                    client_name?: string | null;
                };
            });

            return { rows, total: count ?? 0, page, pageSize };
        },

        /**
         * Saves commission rows for one póliza without duplicating receipts
         * (see `planDetailWrites`): same RECIBO updates, otherwise inserts.
         */
        /**
         * Saves commission rows per póliza without duplicating receipts (see `planDetailWrites`):
         * same RECIBO updates, otherwise inserts. Loads and writes all pólizas of the map together.
         */
        writeImportedDetails: async (
            detailsByContract: Map<string, ImportedDetail[]>,
        ): Promise<Map<string, { inserted: ImportedDetail[]; updated: ImportedDetail[]; skipped: number }>> => {
            const results = new Map<string, { inserted: ImportedDetail[]; updated: ImportedDetail[]; skipped: number }>();
            const contractIds = [...detailsByContract.keys()].filter(
                (id) => (detailsByContract.get(id)?.length ?? 0) > 0,
            );
            if (contractIds.length === 0) return results;

            const existingByContract = new Map<string, ContractDetail[]>();
            for (const chunk of chunkArray(contractIds, IMPORT_BATCH_SIZE)) {
                const { data, error } = await supabase
                    .from('contract_detail')
                    .select('*')
                    .in('contract_id', chunk);
                if (error) throw error;
                for (const row of (data || []) as ContractDetail[]) {
                    const list = existingByContract.get(row.contract_id);
                    if (list) list.push(row);
                    else existingByContract.set(row.contract_id, [row]);
                }
            }

            const inserts: ImportedDetail[] = [];
            const updates: Array<ImportedDetail & { id: string }> = [];
            for (const contractId of contractIds) {
                const plan = planDetailWrites(
                    existingByContract.get(contractId) ?? [],
                    detailsByContract.get(contractId) ?? [],
                );
                inserts.push(...plan.inserts);
                updates.push(...plan.updates.map(({ id, record }) => ({ ...record, id })));
                results.set(contractId, {
                    inserted: plan.inserts,
                    updated: plan.updates.map(({ record }) => record),
                    skipped: plan.skipped,
                });
            }

            for (const chunk of chunkArray(inserts, IMPORT_BATCH_SIZE)) {
                const { error } = await supabase.from('contract_detail').insert(chunk);
                if (error) throw error;
            }
            for (const chunk of chunkArray(updates, IMPORT_BATCH_SIZE)) {
                const { error } = await supabase
                    .from('contract_detail')
                    .upsert(chunk, { onConflict: 'id' });
                if (error) throw error;
            }

            return results;
        },
    };

    return contractDetailDb;
}
