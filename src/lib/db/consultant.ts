import type { SupabaseClient } from '@supabase/supabase-js';
import type { Consultant, ConsultantPortfolio } from '@/lib/supabase';
import { auditDiff, writeAuditLog, type AuditActor } from './audit-log';
import { normalizePageParams, toRange, type PageParams, type PageResult, type SortOrder } from '@/lib/pagination';

/** `consultant` table access (RLS-scoped client: browser session or user JWT). */
export function createConsultantDb(supabase: SupabaseClient) {
    const consultantDb = {
        /** Asesores page with cartera per asesor (`list_consultant_portfolio`, promotoría only). */
        listPortfolio: async (opts: {
            officeId: string;
            search?: string;
            status?: Consultant['status'] | null;
            sort?: SortOrder;
            riskDays: number;
            dueSoonDays: number;
        } & Partial<PageParams>): Promise<ConsultantPortfolio> => {
            const { page, pageSize } = normalizePageParams(opts);
            const { data, error } = await supabase.rpc('list_consultant_portfolio', {
                office_id_param: opts.officeId,
                search_text: opts.search?.trim() || null,
                status_filter: opts.status ?? null,
                sort_column: opts.sort?.column ?? 'name',
                sort_ascending: opts.sort?.ascending ?? true,
                page_limit: pageSize,
                page_offset: (page - 1) * pageSize,
                risk_days: opts.riskDays,
                due_soon_days: opts.dueSoonDays,
            });
            if (error) throw error;
            return data as ConsultantPortfolio;
        },

        getConsultantById: async (id: string): Promise<Consultant | null> => {
            // Search by both id and auth_user_id
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .or(`id.eq.${id},auth_user_id.eq.${id}`)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getConsultantsByOffice: async (officeId: string): Promise<Consultant[]> => {
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .eq('office_id', officeId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getConsultantsByOfficePage: async (
            officeId: string,
            params: Partial<PageParams> & {
                search?: string;
                status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'NOT_INVITED' | 'ALL';
                sort?: SortOrder;
            } = {},
        ): Promise<PageResult<Consultant>> => {
            const { page, pageSize } = normalizePageParams(params);
            const { from, to } = toRange(page, pageSize);
            const sortCol = params.sort?.column &&
                ['name', 'email', 'consultant_code', 'status', 'created_at'].includes(params.sort.column)
                ? params.sort.column
                : 'created_at';
            const ascending = params.sort?.ascending ?? false;

            let query = supabase
                .from('consultant')
                .select('*', { count: 'exact' })
                .eq('office_id', officeId)
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (params.status && params.status !== 'ALL') {
                query = query.eq('status', params.status);
            }

            const search = params.search?.trim();
            if (search) {
                const pattern = `%${search}%`;
                query = query.or(
                    `name.ilike.${pattern},email.ilike.${pattern},consultant_code.ilike.${pattern}`,
                );
            }

            const { data, error, count } = await query;
            if (error) throw error;
            return {
                rows: (data as Consultant[]) || [],
                total: count ?? 0,
                page,
                pageSize,
            };
        },

        /** Asesor edits its own display name (RLS) and logs `consultant.update`. */
        updateOwnNameWithAudit: async (id: string, name: string, actor: AuditActor): Promise<void> => {
            const { data: before, error: readError } = await supabase
                .from('consultant')
                .select('name')
                .eq('id', id)
                .maybeSingle();
            if (readError) throw readError;
            const { oldValues, newValues } = auditDiff(before ?? {}, { name });
            if (Object.keys(newValues).length === 0) return;

            const { error } = await supabase
                .from('consultant')
                .update({ name, updated_at: new Date().toISOString() })
                .eq('id', id);
            if (error) throw error;

            await writeAuditLog(supabase, {
                officeId: actor.officeId,
                actorUserId: actor.userId,
                actorRole: actor.role,
                action: 'consultant.update',
                entityType: 'consultant',
                entityId: id,
                source: 'ui',
                oldValues,
                newValues,
            });
        },

        updateConsultant: async (id: string, updates: Partial<Consultant>): Promise<void> => {
            // Auth email updates require the service role — use POST /api/consultants/update instead.
            if (updates.email !== undefined) {
                throw new Error(
                    'Actualiza el correo del asesor vía /api/consultants/update (servidor).',
                );
            }

            const { error } = await supabase
                .from('consultant')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },

        findConsultantByCode: async (code: string, officeId?: string): Promise<Consultant | null> => {
            let query = supabase
                .from('consultant')
                .select('*')
                .eq('consultant_code', code.trim())
                .limit(1);

            if (officeId) {
                query = query.eq('office_id', officeId);
            }

            const { data, error } = await query.maybeSingle();

            if (error && error.code !== 'PGRST116') {
                throw error;
            }

            return data;
        },

        /**
         * Lookup-only (RLS). Create missing consultants via POST /api/extractor/create-consultants first.
         */
        ensureConsultantForImport: async (
            code: string,
            officeId: string
        ): Promise<{ consultant: Consultant | null; created: boolean; error?: string }> => {
            const trimmed = code.trim();
            if (!trimmed) {
                return { consultant: null, created: false, error: 'Código de asesor vacío' };
            }

            const existing = await consultantDb.findConsultantByCode(trimmed, officeId);
            if (existing) {
                return { consultant: existing, created: false };
            }

            return {
                consultant: null,
                created: false,
                error: `No hay un asesor con código "${trimmed}" en tu promotoría. Créalo antes de importar.`,
            };
        },
    };

    return consultantDb;
}
