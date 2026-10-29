import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditSource, Client, Consultant, Contract, ContractPortfolio, ContractSource } from '@/lib/supabase';
import type { PortfolioStatus } from '@/lib/collections/status';
import type { PolicyStatus } from '@/lib/contracts/policy-status';
import { auditDiff, writeAuditLog, type AuditActor } from './audit-log';
import type { EditResult } from './edit-result';
import { emptyPageResult, normalizePageParams, toRange, type PageParams, type PageResult, type SortOrder } from '@/lib/pagination';
import { createConsultantDb } from './consultant';
import { IMPORT_BATCH_SIZE, chunkArray } from '@/lib/extractor/batch';

/** `contract` table access (RLS-scoped client: browser session or user JWT). */
export function createContractDb(supabase: SupabaseClient) {
    /** Imports stored FECHA EMISION on contract_detail only. Fill the póliza row for display. */
    async function fillMissingContractIssueDates(
        rows: Array<{ id: string; issue_date?: string | null }>,
    ): Promise<void> {
        const missingIds = rows.filter((row) => !row.issue_date).map((row) => row.id);
        if (missingIds.length === 0) return;

        const { data, error } = await supabase
            .from('contract_detail')
            .select('contract_id, issue_date')
            .in('contract_id', missingIds)
            .not('issue_date', 'is', null);
        if (error) throw error;

        const earliest = new Map<string, string>();
        for (const detail of data || []) {
            const contractId = detail.contract_id as string;
            const issueDate = detail.issue_date as string | null;
            if (!issueDate) continue;
            const current = earliest.get(contractId);
            if (!current || issueDate < current) earliest.set(contractId, issueDate);
        }

        for (const row of rows) {
            if (!row.issue_date) {
                const fromDetail = earliest.get(row.id);
                if (fromDetail) row.issue_date = fromDetail;
            }
        }
    }

    const consultantDb = createConsultantDb(supabase);

    const contractDb = {
        getContractById: async (id: string): Promise<Contract | null> => {
            const { data, error } = await supabase
                .from('contract')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getContractWithRelations: async (id: string): Promise<{ contract: Contract; client: Client | null; consultant: Consultant | null } | null> => {
            // Get contract with related client and consultant in a single query using joins
            const { data, error } = await supabase
                .from('contract')
                .select('*, client:client_id(*), consultant:consultant_id(*)')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            if (!data) return null;

            const { client, consultant, ...contract } = data as any;
            return {
                contract: contract as Contract,
                client: client as Client | null,
                consultant: consultant as Consultant | null,
            };
        },

        getContractsByConsultant: async (consultantId: string): Promise<Contract[]> => {
            const { data, error } = await supabase
                .from('contract')
                .select('*')
                .eq('consultant_id', consultantId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getContractsWithClients: async (consultantId?: string, officeId?: string): Promise<Array<Contract & { client_name?: string }>> => {
            // Get contracts with client names in a single query using joins
            let query = supabase
                .from('contract')
                .select('*, client:client_id(name)')
                .order('created_at', { ascending: false });

            if (consultantId) {
                query = query.eq('consultant_id', consultantId);
            } else if (officeId) {
                // For office, get consultant IDs first
                const consultants = await consultantDb.getConsultantsByOffice(officeId);
                const consultantIds = consultants.map(c => c.id);
                if (consultantIds.length === 0) return [];
                query = query.in('consultant_id', consultantIds);
            }

            const { data, error } = await query;
            if (error) throw error;
            if (!data) return [];

            return data.map((item: any) => {
                const { client, ...contract } = item;
                return {
                    ...contract,
                    client_name: client?.name || null,
                } as Contract & { client_name?: string };
            });
        },

        /** How many pólizas (any status) an office or asesor has — empty-cartera screens. */
        countContracts: async (scope: { officeId?: string; consultantId?: string }): Promise<number> => {
            let query = supabase.from('contract').select('id', { count: 'exact', head: true });
            if (scope.officeId) query = query.eq('office_id', scope.officeId);
            if (scope.consultantId) query = query.eq('consultant_id', scope.consultantId);
            const { count, error } = await query;
            if (error) throw error;
            return count ?? 0;
        },

        /** Pólizas page with cartera status, chip counts and counters (`list_contract_portfolio`). */
        listPortfolio: async (opts: {
            officeId?: string;
            consultantId?: string;
            clientId?: string;
            search?: string;
            status?: PortfolioStatus | null;
            policyStatus?: PolicyStatus | null;
            sort?: SortOrder;
            riskDays: number;
            dueSoonDays: number;
        } & Partial<PageParams>): Promise<ContractPortfolio> => {
            const { page, pageSize } = normalizePageParams(opts);
            const { data, error } = await supabase.rpc('list_contract_portfolio', {
                office_id_param: opts.officeId ?? null,
                consultant_id_param: opts.consultantId ?? null,
                client_id_param: opts.clientId ?? null,
                search_text: opts.search?.trim() || null,
                status_filter: opts.status ?? null,
                sort_column: opts.sort?.column ?? 'next_due',
                sort_ascending: opts.sort?.ascending ?? true,
                page_limit: pageSize,
                page_offset: (page - 1) * pageSize,
                risk_days: opts.riskDays,
                due_soon_days: opts.dueSoonDays,
                policy_status_filter: opts.policyStatus ?? null,
            });
            if (error) throw error;
            return data as ContractPortfolio;
        },

        getContractsWithClientsPage: async (
            opts: {
                consultantId?: string;
                officeId?: string;
                clientId?: string;
                search?: string;
                currency?: string;
                paymentMethod?: string;
                captureDateFrom?: string;
                captureDateTo?: string;
                sort?: SortOrder;
            } & Partial<PageParams> = {},
        ): Promise<PageResult<Contract & { client_name?: string }>> => {
            const { page, pageSize } = normalizePageParams(opts);
            const { from, to } = toRange(page, pageSize);

            const allowedSort = [
                'contract_number',
                'project_name',
                'insured_amount',
                'annual_premium',
                'payment_method',
                'currency',
                'payment_channel',
                'capture_date',
                'issue_date',
                'status',
                'created_at',
            ];
            const sortCol =
                opts.sort?.column && allowedSort.includes(opts.sort.column)
                    ? opts.sort.column
                    : 'created_at';
            const ascending = opts.sort?.ascending ?? false;

            let query = supabase
                .from('contract')
                .select('*, client:client_id(name)', { count: 'exact' })
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (opts.consultantId) {
                query = query.eq('consultant_id', opts.consultantId);
            } else if (opts.officeId) {
                const consultants = await consultantDb.getConsultantsByOffice(opts.officeId);
                const consultantIds = consultants.map((c) => c.id);
                if (consultantIds.length === 0) {
                    return emptyPageResult(opts);
                }
                query = query.in('consultant_id', consultantIds);
            }

            if (opts.clientId) {
                query = query.eq('client_id', opts.clientId);
            }
            if (opts.currency?.trim()) {
                query = query.eq('currency', opts.currency.trim());
            }
            if (opts.paymentMethod?.trim()) {
                query = query.eq('payment_method', opts.paymentMethod.trim());
            }
            if (opts.captureDateFrom) {
                query = query.gte('capture_date', opts.captureDateFrom);
            }
            if (opts.captureDateTo) {
                query = query.lte('capture_date', opts.captureDateTo);
            }

            const search = opts.search?.trim();
            if (search) {
                const pattern = `%${search}%`;
                query = query.or(
                    `contract_number.ilike.${pattern},project_name.ilike.${pattern},payment_channel.ilike.${pattern}`,
                );
            }

            const { data, error, count } = await query;
            if (error) throw error;

            const rows = (data || []).map((item: any) => {
                const { client, ...contract } = item;
                return {
                    ...contract,
                    client_name: client?.name || null,
                } as Contract & { client_name?: string };
            });

            await fillMissingContractIssueDates(rows);

            return { rows, total: count ?? 0, page, pageSize };
        },

        /** Pólizas by number, limited to the given asesores (office import) or one asesor. */
        /** Pólizas of the office by number, with their client and asesor (registry import review). */
        findWithPartiesByNumbers: async (
            contractNumbers: string[],
            officeId: string,
        ): Promise<Array<Contract & { client: Client | null; consultant: Pick<Consultant, 'id' | 'consultant_code' | 'name'> | null }>> => {
            const out: Array<Contract & { client: Client | null; consultant: Pick<Consultant, 'id' | 'consultant_code' | 'name'> | null }> = [];
            for (const chunk of chunkArray([...new Set(contractNumbers)], IMPORT_BATCH_SIZE)) {
                const { data, error } = await supabase
                    .from('contract')
                    .select('*, client:client_id(*), consultant:consultant_id(id, consultant_code, name)')
                    .eq('office_id', officeId)
                    .in('contract_number', chunk);
                if (error) throw error;
                out.push(...((data ?? []) as typeof out));
            }
            return out;
        },

        /**
         * Insurer reported these pólizas en vigor on `asOf`: moves `in_force_as_of` forward (never back)
         * for the ones en vigor. Returns how many changed. Metadata only, no per-póliza audit.
         */
        confirmInForce: async (ids: string[], asOf: string): Promise<number> => {
            let changed = 0;
            for (const chunk of chunkArray([...new Set(ids)], IMPORT_BATCH_SIZE)) {
                const { data, error } = await supabase
                    .from('contract')
                    .update({ in_force_as_of: asOf })
                    .in('id', chunk)
                    .eq('status', 'IN_FORCE')
                    .or(`in_force_as_of.is.null,in_force_as_of.lt.${asOf}`)
                    .select('id');
                if (error) throw error;
                changed += data?.length ?? 0;
            }
            return changed;
        },

        findByNumbers: async (
            contractNumbers: string[],
            scope: { consultantIds?: string[]; consultantId?: string },
        ): Promise<Contract[]> => {
            if (contractNumbers.length === 0) return [];
            let query = supabase
                .from('contract')
                .select('*')
                .in('contract_number', contractNumbers);
            if (scope.consultantIds && scope.consultantIds.length > 0) {
                query = query.in('consultant_id', scope.consultantIds);
            } else if (scope.consultantId) {
                query = query.eq('consultant_id', scope.consultantId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return (data as Contract[]) || [];
        },

        getContractsByOffice: async (officeId: string): Promise<Contract[]> => {
            // Get consultant IDs for this office first (cached if possible)
            const consultants = await consultantDb.getConsultantsByOffice(officeId);
            const consultantIds = consultants.map(c => c.id);

            if (consultantIds.length === 0) return [];

            // Single query to get all contracts
            const { data, error } = await supabase
                .from('contract')
                .select('*')
                .in('consultant_id', consultantIds)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        createContract: async (
            contract: Omit<Contract, 'id' | 'created_at' | 'updated_at' | 'office_id'> & {
                office_id?: string;
            },
        ): Promise<Contract> => {
            let officeId = contract.office_id;
            if (!officeId) {
                const { data: cons, error: consErr } = await supabase
                    .from('consultant')
                    .select('office_id')
                    .eq('id', contract.consultant_id)
                    .single();
                if (consErr) throw consErr;
                officeId = cons.office_id;
            }
            const source: ContractSource = contract.source ?? 'manual';
            const { data, error } = await supabase
                .from('contract')
                .insert({
                    ...contract,
                    office_id: officeId,
                    source,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        /** Creates several imported pólizas in one insert (each row carries its `office_id`). */
        createContracts: async (
            contracts: Array<Omit<Contract, 'id' | 'created_at' | 'updated_at'>>,
        ): Promise<Contract[]> => {
            if (contracts.length === 0) return [];
            const { data, error } = await supabase
                .from('contract')
                .insert(contracts)
                .select();
            if (error) throw error;
            return (data as Contract[]) || [];
        },

        updateContract: async (id: string, updates: Partial<Contract>): Promise<Contract> => {
            const { data, error } = await supabase
                .from('contract')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        /** Edit a póliza (RLS-scoped) and log only the changed fields as `contract.update`. */
        updateWithAudit: async (
            id: string,
            patch: Partial<Contract>,
            actor: AuditActor,
            source: AuditSource = 'ui',
        ): Promise<EditResult<Contract>> => {
            const { data: before, error: readError } = await supabase
                .from('contract')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (readError) throw readError;
            if (!before) return { ok: false, error: 'No encontramos la póliza.' };

            const { oldValues, newValues } = auditDiff(before, patch);
            if (Object.keys(newValues).length === 0) return { ok: true, data: before as Contract };

            const { data, error } = await supabase
                .from('contract')
                .update({ ...newValues, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) {
                if (error.code === '23505') {
                    return {
                        ok: false,
                        error: 'Ya existe otra póliza con ese número.',
                        fieldErrors: { contractNumber: 'Ya existe otra póliza con ese número.' },
                    };
                }
                throw error;
            }

            await writeAuditLog(supabase, {
                officeId: (before.office_id as string) ?? actor.officeId,
                actorUserId: actor.userId,
                actorRole: actor.role,
                action: 'contract.update',
                entityType: 'contract',
                entityId: id,
                source,
                oldValues: { ...oldValues, contract_number: before.contract_number ?? null },
                newValues: { ...newValues, contract_number: data.contract_number ?? null },
            });
            return { ok: true, data: data as Contract };
        },
    };

    return contractDb;
}
