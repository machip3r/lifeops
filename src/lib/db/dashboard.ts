import type { SupabaseClient } from '@supabase/supabase-js';
import type { CollectionOverview, Consultant, ContractAtRisk, ContractPendingPayment } from '@/lib/supabase';

/** `dashboard` table access (RLS-scoped client: browser session or user JWT). */
export function createDashboardDb(supabase: SupabaseClient) {
    const dashboardDb = {
        // Get total prima pago and prima meta for an office (optional filters: date range, seniority range, consultants, ramo, forma pago)
        getOfficeTotals: async (
            officeId: string,
            startDate?: string | null,
            endDate?: string | null,
            dateBasis: 'payment' | 'issue' = 'payment',
            seniorityMin?: number | null,
            seniorityMax?: number | null,
            consultantIds?: string[] | null,
            contractTypeFilter?: 'VI' | 'GM' | null,
            paymentMethodFilter?: string | null
        ): Promise<{ totalPrimaPago: number; totalPrimaMeta: number }> => {
            const { data, error } = await supabase.rpc('get_office_totals', {
                office_id_param: officeId,
                start_date: startDate || null,
                end_date: endDate || null,
                date_basis: dateBasis,
                seniority_min: seniorityMin ?? null,
                seniority_max: seniorityMax ?? null,
                consultant_ids: consultantIds || null,
                contract_type_filter: contractTypeFilter ?? null,
                payment_method_filter: paymentMethodFilter || null,
            });

            if (error) throw error;
            if (!data || data.length === 0) {
                return { totalPrimaPago: 0, totalPrimaMeta: 0 };
            }

            return {
                totalPrimaPago: parseFloat(data[0].total_prima_pago || '0') || 0,
                totalPrimaMeta: parseFloat(data[0].total_prima_meta || '0') || 0,
            };
        },

        // Get top consultants by sales for an office (optional filters: date range, seniority range, consultants, ramo, forma pago)
        getTopConsultantsBySales: async (
            officeId: string,
            limit: number = 3,
            startDate?: string | null,
            endDate?: string | null,
            dateBasis: 'payment' | 'issue' = 'payment',
            seniorityMin?: number | null,
            seniorityMax?: number | null,
            consultantIds?: string[] | null,
            contractTypeFilter?: 'VI' | 'GM' | null,
            paymentMethodFilter?: string | null
        ): Promise<Array<{ consultant: Consultant; sales: number }>> => {
            const { data, error } = await supabase.rpc('get_top_consultants_by_sales', {
                office_id_param: officeId,
                limit_count: limit,
                start_date: startDate || null,
                end_date: endDate || null,
                date_basis: dateBasis,
                seniority_min: seniorityMin ?? null,
                seniority_max: seniorityMax ?? null,
                consultant_ids: consultantIds || null,
                contract_type_filter: contractTypeFilter ?? null,
                payment_method_filter: paymentMethodFilter || null,
            });

            if (error) throw error;
            if (!data || data.length === 0) {
                return [];
            }

            // Map the RPC result to our expected format
            return data.map((row: any) => ({
                consultant: {
                    id: row.consultant_id,
                    name: row.consultant_name,
                    consultant_code: row.consultant_code,
                    email: row.consultant_email,
                    office_id: officeId,
                    auth_user_id: null,
                    status: 'ACTIVE' as const,
                } as Consultant,
                sales: parseFloat(row.total_sales || '0') || 0,
            }));
        },

        // Get office totals by contract type (VI and GM) - prima meta only (optional filters: date range, seniority range, consultants, ramo, forma pago)
        getOfficeTotalsByType: async (
            officeId: string,
            startDate?: string | null,
            endDate?: string | null,
            dateBasis: 'payment' | 'issue' = 'payment',
            seniorityMin?: number | null,
            seniorityMax?: number | null,
            consultantIds?: string[] | null,
            contractTypeFilter?: 'VI' | 'GM' | null,
            paymentMethodFilter?: string | null
        ): Promise<{ primaMetaVI: number; primaMetaGM: number }> => {
            const { data, error } = await supabase.rpc('get_office_totals_by_type', {
                office_id_param: officeId,
                start_date: startDate || null,
                end_date: endDate || null,
                date_basis: dateBasis,
                seniority_min: seniorityMin ?? null,
                seniority_max: seniorityMax ?? null,
                consultant_ids: consultantIds || null,
                contract_type_filter: contractTypeFilter ?? null,
                payment_method_filter: paymentMethodFilter || null,
            });

            if (error) throw error;
            if (!data || data.length === 0) {
                return { primaMetaVI: 0, primaMetaGM: 0 };
            }

            return {
                primaMetaVI: parseFloat(data[0].prima_meta_vi || '0') || 0,
                primaMetaGM: parseFloat(data[0].prima_meta_gm || '0') || 0,
            };
        },

        listContractsAtRisk: async (params: {
            officeId?: string | null;
            consultantId?: string | null;
            riskDays?: number;
            lookbackMonths?: number;
        }): Promise<ContractAtRisk[]> => {
            const { data, error } = await supabase.rpc('list_contracts_at_risk', {
                office_id_param: params.officeId ?? null,
                consultant_id_param: params.consultantId ?? null,
                risk_days: params.riskDays ?? 30,
                lookback_months: params.lookbackMonths ?? 12,
            });
            if (error) throw error;
            return (data || []).map((row: Record<string, unknown>) => ({
                contract_id: row.contract_id as string,
                office_id: row.office_id as string,
                consultant_id: row.consultant_id as string,
                client_id: (row.client_id as string | null) ?? null,
                contract_number: (row.contract_number as string | null) ?? null,
                client_name: (row.client_name as string | null) ?? null,
                consultant_name: (row.consultant_name as string | null) ?? null,
                collection_day: (row.collection_day as number | null) ?? null,
                due_date: row.due_date as string,
                days_overdue: Number(row.days_overdue) || 0,
                collection_status: (row.collection_status as string | null) ?? null,
            }));
        },

        /** Vista general in one call: status buckets, aging, payments per month, per asesor. */
        getCollectionOverview: async (params: {
            officeId?: string;
            consultantId?: string;
            riskDays: number;
            dueSoonDays: number;
        }): Promise<CollectionOverview> => {
            const { data, error } = await supabase.rpc('get_collection_overview', {
                office_id_param: params.officeId ?? null,
                consultant_id_param: params.consultantId ?? null,
                risk_days: params.riskDays,
                due_soon_days: params.dueSoonDays,
            });
            if (error) throw error;
            return data as CollectionOverview;
        },

        listContractsPendingPayment: async (params: {
            officeId?: string | null;
            consultantId?: string | null;
            withinDays?: number;
        }): Promise<ContractPendingPayment[]> => {
            const { data, error } = await supabase.rpc('list_contracts_pending_payment', {
                office_id_param: params.officeId ?? null,
                consultant_id_param: params.consultantId ?? null,
                within_days: params.withinDays ?? 15,
            });
            if (error) throw error;
            return (data || []).map((row: Record<string, unknown>) => ({
                contract_id: row.contract_id as string,
                office_id: row.office_id as string,
                consultant_id: row.consultant_id as string,
                client_id: (row.client_id as string | null) ?? null,
                contract_number: (row.contract_number as string | null) ?? null,
                client_name: (row.client_name as string | null) ?? null,
                consultant_name: (row.consultant_name as string | null) ?? null,
                collection_day: (row.collection_day as number | null) ?? null,
                due_date: row.due_date as string,
                days_until_due: Number(row.days_until_due) || 0,
                is_overdue: Boolean(row.is_overdue),
            }));
        },
    };

    return dashboardDb;
}
