import { supabase } from './supabase';
import type {
    Office,
    Consultant,
    ConsultantWithTags,
    Client,
    Contract,
    ContractChangeRequest,
    File,
    ContractDetail,
    Tag,
    TagSection,
} from './supabase';
import {
    syncPaymentsFromImportedDetailsBatch,
    writeImportSyncAudit,
} from '@/lib/collections/service';
import { chunkArray, IMPORT_BATCH_SIZE } from '@/lib/extractor/batch';
import {
    importProgressPercent,
    type ImportProgress,
} from '@/lib/extractor/import-progress';
import {
    emptyPageResult,
    normalizePageParams,
    toRange,
    type PageParams,
    type PageResult,
    type SortOrder,
} from '@/lib/pagination';
import { tagNameSchema, tagSectionSchema } from '@/lib/validation/schemas';

type ConsultantTagEmbed = {
    tag_id: string;
    tag: Tag | Tag[] | null;
};

function tagsFromConsultantEmbed(rows: ConsultantTagEmbed[] | null | undefined): Tag[] {
    if (!rows?.length) return [];
    const out: Tag[] = [];
    for (const row of rows) {
        const raw = row.tag;
        const tag = Array.isArray(raw) ? raw[0] : raw;
        if (tag?.id) out.push(tag);
    }
    return out.sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

function mapConsultantWithTags(
    row: Consultant & { consultant_tag?: ConsultantTagEmbed[] | null },
): ConsultantWithTags {
    const { consultant_tag, ...consultant } = row;
    return {
        ...(consultant as Consultant),
        tags: tagsFromConsultantEmbed(consultant_tag),
    };
}
async function attachContractCounts(
    clients: Client[],
): Promise<Array<Client & { contract_count?: number }>> {
    if (clients.length === 0) return [];
    const ids = clients.map((c) => c.id);
    const { data, error } = await supabase
        .from('contract')
        .select('client_id')
        .in('client_id', ids);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const row of data || []) {
        const cid = row.client_id as string | null;
        if (!cid) continue;
        counts.set(cid, (counts.get(cid) ?? 0) + 1);
    }
    return clients.map((c) => ({
        ...c,
        contract_count: counts.get(c.id) ?? 0,
    }));
}

// Token interface
export interface Token {
    id: string;
    token: string;
    type: 'CONSULTANT_INVITATION' | 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
    status: 'ACTIVE' | 'USED' | 'EXPIRED';
    used_at?: string | null;
    expires_at: string;
    created_at?: string;
    updated_at?: string;
    metadata?: {
        [key: string]: any;
    };
}

// Database functions organized by table
export const db = {
    // Office functions
    office: {
        getOfficeById: async (id: string): Promise<Office | null> => {
            const { data, error } = await supabase
                .from('office')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getOfficeByEmail: async (email: string): Promise<Office | null> => {
            const { data, error } = await supabase
                .from('office')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        createOffice: async (user_id: string, email: string, name: string): Promise<void> => {
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

        getAllOffices: async (): Promise<Office[]> => {
            const { data, error } = await supabase
                .from('office')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },
    },

    // Consultant functions
    consultant: {
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

        getConsultantByEmail: async (email: string): Promise<Consultant | null> => {
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .eq('email', email)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getConsultantByCode: async (code: string): Promise<Consultant | null> => {
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .eq('consultant_code', code)
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
                status?: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'ALL';
                /** Match consultants that have any of these tag ids (OR). */
                tagIds?: string[];
                sort?: SortOrder;
            } = {},
        ): Promise<PageResult<ConsultantWithTags>> => {
            const { page, pageSize } = normalizePageParams(params);
            const { from, to } = toRange(page, pageSize);
            const sortCol = params.sort?.column &&
                ['name', 'email', 'consultant_code', 'status', 'created_at'].includes(params.sort.column)
                ? params.sort.column
                : 'created_at';
            const ascending = params.sort?.ascending ?? false;

            const tagIds = (params.tagIds || []).filter(Boolean);
            let tagFilteredIds: string[] | null = null;
            if (tagIds.length > 0) {
                const { data: links, error: tagErr } = await supabase
                    .from('consultant_tag')
                    .select('consultant_id')
                    .in('tag_id', tagIds);
                if (tagErr) throw tagErr;
                tagFilteredIds = [...new Set((links || []).map((r) => r.consultant_id as string))];
                if (tagFilteredIds.length === 0) {
                    return emptyPageResult({ page, pageSize });
                }
            }

            let query = supabase
                .from('consultant')
                .select('*, consultant_tag(tag_id, tag(*))', { count: 'exact' })
                .eq('office_id', officeId)
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (tagFilteredIds) {
                query = query.in('id', tagFilteredIds);
            }

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
                rows: ((data as Array<Consultant & { consultant_tag?: ConsultantTagEmbed[] }>) || []).map(
                    mapConsultantWithTags,
                ),
                total: count ?? 0,
                page,
                pageSize,
            };
        },

        getConsultantTags: async (consultantId: string): Promise<Tag[]> => {
            const { data, error } = await supabase
                .from('consultant_tag')
                .select('tag_id, tag(*)')
                .eq('consultant_id', consultantId);
            if (error) throw error;
            return tagsFromConsultantEmbed((data as ConsultantTagEmbed[]) || []);
        },

        setConsultantTags: async (consultantId: string, tagIds: string[]): Promise<Tag[]> => {
            const uniqueIds = [...new Set(tagIds.filter(Boolean))];

            const { error: delErr } = await supabase
                .from('consultant_tag')
                .delete()
                .eq('consultant_id', consultantId);
            if (delErr) throw delErr;

            if (uniqueIds.length > 0) {
                const { error: insErr } = await supabase.from('consultant_tag').insert(
                    uniqueIds.map((tag_id) => ({ consultant_id: consultantId, tag_id })),
                );
                if (insErr) throw insErr;
            }

            return db.consultant.getConsultantTags(consultantId);
        },
        createConsultant: async (
            user_id: string,
            email: string,
            name: string,
            consultant_code: string,
            office_id: string
        ): Promise<void> => {
            const { error } = await supabase.rpc('create_consultant', {
                user_id,
                user_email: email,
                consultant_name: name,
                consultant_code,
                office_id_param: office_id,
            });

            if (error) throw error;
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

        getAllConsultants: async (): Promise<Consultant[]> => {
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        findConsultantByName: async (name: string, officeId?: string): Promise<Consultant | null> => {
            let query = supabase
                .from('consultant')
                .select('*')
                .ilike('name', name.trim())
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

            const existing = await db.consultant.findConsultantByCode(trimmed, officeId);
            if (existing) {
                return { consultant: existing, created: false };
            }

            return {
                consultant: null,
                created: false,
                error: `No hay un asesor con código "${trimmed}" en tu oficina. Créalo antes de importar.`,
            };
        },

        findOrCreateConsultantByName: async (name: string, officeId: string): Promise<Consultant> => {
            // First try to find existing consultant by name
            const existing = await db.consultant.findConsultantByName(name, officeId);
            if (existing) {
                return existing;
            }

            // Create new consultant with empty values
            // id will be auto-generated (gen_random_uuid())
            // Generate a temporary consultant_code based on name
            const initials = name.trim()
                .split(' ')
                .map(n => n[0])
                .join('')
                .toUpperCase()
                .substring(0, 3) || 'CON';
            const tempCode = `${initials}${Date.now().toString().slice(-6)}`;

            const { data, error } = await supabase
                .from('consultant')
                .insert({
                    // id will be auto-generated by default
                    office_id: officeId,
                    name: name.trim(),
                    email: null, // Will be filled when consultant is invited
                    consultant_code: tempCode, // Temporary code, can be updated
                    auth_user_id: null, // Will be set when consultant is invited
                    status: 'PENDING',
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },
    },

    tag: {
        listByOffice: async (officeId: string, section: TagSection = 'consultant'): Promise<Tag[]> => {
            const parsedSection = tagSectionSchema.parse(section);
            const { data, error } = await supabase
                .from('tag')
                .select('*')
                .eq('office_id', officeId)
                .eq('section', parsedSection)
                .order('name', { ascending: true });
            if (error) throw error;
            return (data as Tag[]) || [];
        },

        create: async (
            officeId: string,
            name: string,
            section: TagSection = 'consultant',
        ): Promise<Tag> => {
            const parsedName = tagNameSchema.safeParse(name);
            if (!parsedName.success) {
                throw new Error('Nombre de etiqueta inválido (máx. 40 caracteres).');
            }
            const parsedSection = tagSectionSchema.parse(section);
            const { data, error } = await supabase
                .from('tag')
                .insert({
                    office_id: officeId,
                    name: parsedName.data,
                    section: parsedSection,
                })
                .select()
                .single();
            if (error) {
                if (error.code === '23505') {
                    throw new Error('Ya existe una etiqueta con ese nombre.');
                }
                throw error;
            }
            return data as Tag;
        },

        delete: async (tagId: string): Promise<void> => {
            const { error } = await supabase.from('tag').delete().eq('id', tagId);
            if (error) throw error;
        },

        rename: async (tagId: string, name: string): Promise<Tag> => {
            const parsedName = tagNameSchema.parse(name);
            const { data, error } = await supabase
                .from('tag')
                .update({ name: parsedName })
                .eq('id', tagId)
                .select()
                .single();
            if (error) {
                if (error.code === '23505') {
                    throw new Error('Ya existe una etiqueta con ese nombre.');
                }
                throw error;
            }
            return data as Tag;
        },

        /** Consultant ids that have any of the given tags (OR). */
        getConsultantIdsByTags: async (tagIds: string[]): Promise<string[]> => {
            const ids = [...new Set(tagIds.filter(Boolean))];
            if (ids.length === 0) return [];
            const { data, error } = await supabase
                .from('consultant_tag')
                .select('consultant_id')
                .in('tag_id', ids);
            if (error) throw error;
            return [...new Set((data || []).map((r) => r.consultant_id as string))];
        },
    },

    // Token functions
    token: {
        getTokenByValue: async (tokenValue: string): Promise<Token | null> => {
            const { data, error } = await supabase
                .from('token')
                .select('*')
                .eq('token', tokenValue)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getTokenById: async (id: string): Promise<Token | null> => {
            const { data, error } = await supabase
                .from('token')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getTokensByOffice: async (officeId: string): Promise<Token[]> => {
            const { data, error } = await supabase
                .from('token')
                .select('*')
                .contains('metadata', { office_id: officeId })
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        createInvitationToken: async (
            type: string,
            office_id: string,
            consultant_email: string,
            consultant_name: string,
            consultant_code: string
        ): Promise<string> => {
            const { data, error } = await supabase.rpc('create_invitation_token', {
                type,
                office_id,
                consultant_email,
                consultant_name,
                consultant_code
            });

            if (error) throw error;
            return data;
        },

        markTokenAsUsed: async (id: string): Promise<void> => {
            const { error } = await supabase.rpc('mark_token_as_used', {
                token_id: id,
            });

            if (error) throw error;
        },

        updateToken: async (id: string, updates: Partial<Token>): Promise<void> => {
            const { error } = await supabase
                .from('token')
                .update(updates)
                .eq('id', id);

            if (error) throw error;
        },
    },

    // Contract functions
    contract: {
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

        getContractsByClient: async (clientId: string): Promise<Contract[]> => {
            const { data, error } = await supabase
                .from('contract')
                .select('*')
                .eq('client_id', clientId)
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
                const consultants = await db.consultant.getConsultantsByOffice(officeId);
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
                const consultants = await db.consultant.getConsultantsByOffice(opts.officeId);
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

            return { rows, total: count ?? 0, page, pageSize };
        },

        getContractsByOffice: async (officeId: string): Promise<Contract[]> => {
            // Get consultant IDs for this office first (cached if possible)
            const consultants = await db.consultant.getConsultantsByOffice(officeId);
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

        createContract: async (contract: Omit<Contract, 'id' | 'created_at' | 'updated_at'>): Promise<Contract> => {
            const { data, error } = await supabase
                .from('contract')
                .insert(contract)
                .select()
                .single();

            if (error) throw error;
            return data;
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

        deleteContract: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('contract')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },

        importContractsFromTable: async (
            rows: string[][],
            officeId: string,
            consultantId?: string, // Optional: if provided, only import for this consultant
            headers?: string[], // Table headers to map columns correctly
            onProgress?: (progress: ImportProgress) => void,
        ): Promise<{ success: number; errors: Array<{ row: number; error: string }>; warnings: Array<{ row: number; message: string }> }> => {
            const errors: Array<{ row: number; error: string }> = [];
            const warnings: Array<{ row: number; message: string }> = [];
            let successCount = 0;
            let detailsInsertedTotal = 0;
            let paymentsUpsertedTotal = 0;
            const pendingCobranza: Array<{
                contractId: string;
                details: Array<{
                    payment_date?: string | null;
                    collection_premium?: number | null;
                }>;
            }> = [];
            const {
                data: { user: importActor },
            } = await supabase.auth.getUser();

            const startedAt = Date.now();
            let lastTickAt = startedAt;
            let lastTickCurrent = 0;

            const report = (
                phase: ImportProgress["phase"],
                current: number,
                total: number,
                message: string,
            ) => {
                if (!onProgress) return;
                const now = Date.now();
                let etaSeconds: number | null = null;
                if (phase === "contracts" && current > 0 && total > 0) {
                    // Prefer recent pace for ETA (last ~progress delta)
                    const deltaCurrent = Math.max(1, current - lastTickCurrent);
                    const deltaMs = Math.max(1, now - lastTickAt);
                    const msPerUnit =
                        current >= 3
                            ? (now - startedAt) / current
                            : deltaMs / deltaCurrent;
                    etaSeconds = Math.round(((total - current) * msPerUnit) / 1000);
                    lastTickAt = now;
                    lastTickCurrent = current;
                }
                onProgress({
                    phase,
                    current,
                    total,
                    percent: importProgressPercent(phase, current, total),
                    etaSeconds,
                    message,
                });
            };

            report("grouping", 0, 1, "Agrupando filas por póliza…");

            // Normalize header names to a canonical form (uppercase, no accents, no spaces/punctuation)
            const normalizeHeader = (h?: string | null): string =>
                (h || '')
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '')
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '');

            const headerIndex = new Map<string, number>();
            if (headers && headers.length > 0) {
                headers.forEach((h, idx) => {
                    headerIndex.set(normalizeHeader(h), idx);
                });
            }

            const getIndex = (candidates: string[], fallback: number): number => {
                for (const name of candidates) {
                    const idx = headerIndex.get(normalizeHeader(name));
                    if (idx !== undefined) return idx;
                }
                return fallback;
            };

            // Indices for contract-level columns
            const clientNameIndex = getIndex(['CLIENTE'], 0);
            const contractNumberIndex = getIndex(['POLIZA'], 1);
            const currencyIndex = getIndex(['MONEDA'], 3);
            const exchangeRateIndex = getIndex(['TIPO CAMBIO'], 4);
            const consultantCodeIndex = getIndex(['ASESOR'], 5); // Consultant code

            // Indices for detail columns (by header name)
            const issueDateIndex = getIndex(['FECHA EMISION'], 8);
            const paymentDateIndex = getIndex(['FECHA PAGO'], 11);
            const premiumPaymentIndex = getIndex(['PRIMA PAGO', 'PRIMA PAGO 1'], 12);
            const paymentMethodIndex = getIndex(['FORMA DE PAGO'], 14);
            const commissionHonorariesIndex = getIndex(['COMISION/HONORARIOS', 'COMISION HONORARIOS'], 15);
            const commissionPercentageIndex = getIndex(['% COMISION', 'PORCENTAJE COMISION'], 16);
            const movementIndex = getIndex(['MOVIMIENTO'], 18);
            const collectionPremiumIndex = getIndex(['PRIMA COBRO'], 19);
            const seniorityIndex = getIndex(['ANTIGÜEDAD', 'ANTIGUEDAD'], 20);
            const targetPremiumIndex = getIndex(['PRIMA META'], 21);
            const commissionPremiumIndex = getIndex(['PRIMA COMISION'], 13);

            const getCell = (row: string[], index: number): string => {
                if (index < 0 || index >= row.length) return '';
                const value = row[index]?.trim();
                return value || '';
            };

            // Group rows by contract (Cliente + Poliza + Asesor)
            type ContractGroup = {
                clientName: string;
                contractNumber: string;
                currency: string;
                exchangeRate: string;
                consultantCode: string;
                rows: Array<{ rowIndex: number; row: string[] }>;
            };

            const contractGroups = new Map<string, ContractGroup>();

            // Group rows by contract
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    const clientName = getCell(row, clientNameIndex);
                    const contractNumber = getCell(row, contractNumberIndex);
                    const currency = getCell(row, currencyIndex);
                    const exchangeRate = getCell(row, exchangeRateIndex);
                    const consultantCode = getCell(row, consultantCodeIndex);

                    if (!clientName || !consultantCode) {
                        errors.push({ row: i + 1, error: 'Missing Cliente or Asesor (Consultant Code)' });
                        continue;
                    }

                    // Create unique key for contract grouping
                    const contractKey = `${clientName}|${contractNumber}|${consultantCode}`;

                    if (!contractGroups.has(contractKey)) {
                        contractGroups.set(contractKey, {
                            clientName,
                            contractNumber,
                            currency: currency || '',
                            exchangeRate: exchangeRate || '',
                            consultantCode,
                            rows: [],
                        });
                    }

                    contractGroups.get(contractKey)!.rows.push({
                        rowIndex: i + 1,
                        row,
                    });
                } catch (error: any) {
                    errors.push({ row: i + 1, error: error.message || 'Error grouping row' });
                }
            }

            report(
                "grouping",
                1,
                1,
                `${contractGroups.size} póliza(s) desde ${rows.length} fila(s)`,
            );

            // Pre-fetch consultants in batch (if not using consultantId); create missing for this office
            const consultantCache = new Map<string, Consultant>();
            const ensureConsultantErrorByCode = new Map<string, string>();
            if (!consultantId) {
                const uniqueConsultantCodes = [...new Set(Array.from(contractGroups.values()).map(g => g.consultantCode))];
                report(
                    "consultants",
                    0,
                    uniqueConsultantCodes.length,
                    `Verificando asesores (0/${uniqueConsultantCodes.length})…`,
                );
                let consultantDone = 0;
                for (const consultantCode of uniqueConsultantCodes) {
                    let consultant = await db.consultant.findConsultantByCode(consultantCode, officeId);
                    if (!consultant) {
                        const ensured = await db.consultant.ensureConsultantForImport(consultantCode, officeId);
                        consultant = ensured.consultant ?? null;
                        if (ensured.created && consultant) {
                            warnings.push({
                                row: 0,
                                message: `Se creó el asesor con código "${consultantCode.trim()}" automáticamente para importar.`,
                            });
                        }
                        if (!consultant && ensured.error) {
                            ensureConsultantErrorByCode.set(consultantCode.toLowerCase(), ensured.error);
                        }
                    }
                    if (consultant) {
                        consultantCache.set(consultantCode.toLowerCase(), consultant);
                    }
                    consultantDone += 1;
                    if (
                        consultantDone === uniqueConsultantCodes.length ||
                        consultantDone % 10 === 0
                    ) {
                        report(
                            "consultants",
                            consultantDone,
                            uniqueConsultantCodes.length,
                            `Verificando asesores (${consultantDone}/${uniqueConsultantCodes.length})…`,
                        );
                    }
                }
            } else {
                report("consultants", 0, 1, "Cargando asesor…");
                const consultant = await db.consultant.getConsultantById(consultantId);
                if (consultant) {
                    consultantCache.set(consultant.consultant_code?.toLowerCase() || '', consultant);
                }
                report("consultants", 1, 1, "Asesor listo");
            }

            // Pre-fetch existing contracts in batch (office-scoped via consultant ids)
            const contractNumbersToCheck = Array.from(contractGroups.values())
                .map(g => g.contractNumber)
                .filter((p): p is string => !!p);

            const existingContractsMap = new Map<string, Contract>();
            if (contractNumbersToCheck.length > 0) {
                const officeConsultantIds = [...consultantCache.values()]
                    .map((c) => c.id)
                    .filter(Boolean);
                for (const numberChunk of chunkArray(
                    [...new Set(contractNumbersToCheck)],
                    IMPORT_BATCH_SIZE,
                )) {
                    let existingQuery = supabase
                        .from('contract')
                        .select('*')
                        .in('contract_number', numberChunk);
                    if (officeConsultantIds.length > 0) {
                        existingQuery = existingQuery.in('consultant_id', officeConsultantIds);
                    } else if (consultantId) {
                        existingQuery = existingQuery.eq('consultant_id', consultantId);
                    }
                    const { data: existingContracts } = await existingQuery;

                    if (existingContracts) {
                        existingContracts.forEach((c: Contract) => {
                            if (c.contract_number) {
                                existingContractsMap.set(c.contract_number, c);
                            }
                        });
                    }
                }
            }

            // Pre-fetch / create clients in batch
            const uniqueClientNames = [...new Set(Array.from(contractGroups.values()).map(g => g.clientName))];
            report(
                "clients",
                0,
                uniqueClientNames.length || 1,
                `Creando/buscando clientes (${uniqueClientNames.length})…`,
            );
            let clientCache: Map<string, Client>;
            try {
                clientCache = await db.client.findOrCreateClientsByName(uniqueClientNames, officeId);
            } catch (clientErr: any) {
                throw new Error(
                    clientErr?.message
                        ? `Error al crear/buscar clientes: ${clientErr.message}`
                        : 'Error al crear/buscar clientes durante la importación.',
                );
            }
            report(
                "clients",
                uniqueClientNames.length || 1,
                uniqueClientNames.length || 1,
                "Clientes listos",
            );

            // Helper functions (defined here so they can be used in the loop)
            // Parse exchange rate - tipo cambio
            const parseExchangeRate = (value: string | null): number | null => {
                if (!value || !value.trim() || value.trim() === 'NULL' || value.trim() === '') return null;
                // Remove commas, spaces, and other formatting
                const cleaned = value.trim().replace(/,/g, '').replace(/\s/g, '');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? null : parsed;
            };

            // Normalize payment method (FORMA DE PAGO) to catalog values
            const normalizePaymentMethod = (value: string | null): string | null => {
                if (!value) return null;
                const raw = value.trim().toLowerCase().replace(/\([^)]*\)/g, '').trim();
                switch (raw) {
                    case '1':
                    case '01':
                    case 'anual':
                        return 'Anual';
                    case '2':
                    case '02':
                    case 'semestral':
                        return 'Semestral';
                    case '4':
                    case '04':
                    case 'trimestral':
                        return 'Trimestral';
                    case '5':
                    case '05':
                    case 'mensual':
                        return 'Mensual';
                    default:
                        return value.trim();
                }
            };

            // Process each contract group
            const contractGroupList = Array.from(contractGroups.entries());
            const contractTotal = contractGroupList.length;
            report(
                "contracts",
                0,
                Math.max(contractTotal, 1),
                `Importando pólizas (0/${contractTotal})…`,
            );

            for (let groupIndex = 0; groupIndex < contractGroupList.length; groupIndex++) {
                const [, group] = contractGroupList[groupIndex];
                try {
                    // Find consultant from cache
                    let consultant: Consultant | undefined;
                    if (consultantId) {
                        consultant = consultantCache.get('');
                        if (consultant && consultant.consultant_code?.toLowerCase() !== group.consultantCode.toLowerCase()) {
                            errors.push({ row: group.rows[0]?.rowIndex || 0, error: `El código de asesor "${group.consultantCode}" no coincide con tu cuenta.` });
                            continue;
                        }
                    } else {
                        consultant = consultantCache.get(group.consultantCode.toLowerCase());
                    }

                    if (!consultant) {
                        const ensureMsg = ensureConsultantErrorByCode.get(group.consultantCode.toLowerCase());
                        errors.push({
                            row: group.rows[0]?.rowIndex || 0,
                            error:
                                ensureMsg ||
                                `No hay un asesor con código "${group.consultantCode}" en tu oficina y no se pudo crear automáticamente.`,
                        });
                        continue;
                    }

                    if (!consultant.id) {
                        errors.push({ row: group.rows[0]?.rowIndex || 0, error: `El asesor "${group.consultantCode}" no tiene ID válido en el sistema.` });
                        continue;
                    }

                    // Get client from cache
                    const client = clientCache.get(group.clientName.toLowerCase());
                    if (!client) {
                        errors.push({ row: group.rows[0]?.rowIndex || 0, error: `Cliente "${group.clientName}" no encontrado` });
                        continue;
                    }

                    // Check if contract already exists (from pre-fetched map)
                    let contract: Contract;
                    let isNewContract = false;
                    if (group.contractNumber) {
                        const existing = existingContractsMap.get(group.contractNumber);
                        if (existing) {
                            // Contract exists, use it
                            warnings.push({ row: group.rows[0]?.rowIndex || 0, message: `Poliza con número "${group.contractNumber}" ya existe. Se omitirá la creación de la póliza, se agregarán solo los detalles.` });
                            contract = existing;
                        } else {
                            // Create new contract — use FORMA DE PAGO from first detail row when present
                            const firstPaymentMethod = normalizePaymentMethod(
                                getCell(group.rows[0]?.row ?? [], paymentMethodIndex) || null,
                            );
                            contract = await db.contract.createContract({
                                consultant_id: consultant.id,
                                client_id: client.id,
                                contract_number: group.contractNumber,
                                currency: group.currency || null,
                                exchange_rate: parseExchangeRate(group.exchangeRate),
                                payment_method: firstPaymentMethod,
                                status: 'ACTIVE',
                            });
                            isNewContract = true;
                            // Add to cache for potential future use
                            existingContractsMap.set(group.contractNumber, contract);
                        }
                    } else {
                        // No contract number; create a new contract anyway
                        contract = await db.contract.createContract({
                            consultant_id: consultant.id,
                            client_id: client.id,
                            contract_number: null,
                            currency: group.currency || null,
                            exchange_rate: parseExchangeRate(group.exchangeRate),
                            status: 'ACTIVE',
                        });
                        isNewContract = true;
                    }

                    // Helper functions
                    // Map columns helper
                    const mapColumn = (detailData: string[], index: number): string | null => {
                        if (index >= detailData.length) return null;
                        const value = detailData[index]?.trim();
                        return value || null;
                    };

                    // Parse dates helper - DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD
                    const parseDate = (dateStr: string | null): string | null => {
                        if (!dateStr || !dateStr.trim()) return null;
                        const trimmed = dateStr.trim();
                        const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
                        if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
                        const parts = trimmed.split('/');
                        if (parts.length === 3) {
                            const day = parts[0].padStart(2, '0');
                            const month = parts[1].padStart(2, '0');
                            const year = parts[2];
                            return `${year}-${month}-${day}`;
                        }
                        return null;
                    };

                    // Parse numeric helper - removes commas and converts to number
                    const parseNumeric = (value: string | null): number | null => {
                        if (!value || !value.trim() || value.trim() === 'NULL') return null;
                        // Remove commas, spaces, and other formatting
                        const cleaned = value.trim().replace(/,/g, '').replace(/\s/g, '');
                        const parsed = parseFloat(cleaned);
                        return isNaN(parsed) ? null : parsed;
                    };

                    // Prepare all detail records first, then batch check for duplicates
                    const detailRecords: Array<{ record: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>; rowInfo: { rowIndex: number; row: string[] } }> = [];

                    // Prepare all details - map by header names instead of fixed indices
                    for (const rowInfo of group.rows) {
                        try {
                            const row = rowInfo.row;

                            const detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'> = {
                                contract_id: contract.id,
                                issue_date: parseDate(getCell(row, issueDateIndex)), // FECHA EMISION
                                payment_date: parseDate(getCell(row, paymentDateIndex)), // FECHA PAGO
                                premium_payment: parseNumeric(getCell(row, premiumPaymentIndex)), // PRIMA PAGO
                                payment_method: normalizePaymentMethod(getCell(row, paymentMethodIndex)), // FORMA DE PAGO
                                commission_honoraries: parseNumeric(getCell(row, commissionHonorariesIndex)), // COMISION/HONORARIOS
                                commission_percentage: parseNumeric(getCell(row, commissionPercentageIndex)), // % COMISION
                                collection_premium: parseNumeric(getCell(row, collectionPremiumIndex)), // PRIMA COBRO
                                seniority: getCell(row, seniorityIndex), // ANTIGÜEDAD
                                target_premium: parseNumeric(getCell(row, targetPremiumIndex)), // PRIMA META
                                movement: getCell(row, movementIndex), // MOVIMIENTO
                                commission_premium: parseNumeric(getCell(row, commissionPremiumIndex)), // PRIMA COMISION
                            };

                            detailRecords.push({ record: detail, rowInfo });
                        } catch (error: any) {
                            errors.push({ row: rowInfo.rowIndex, error: `Error creating detail: ${error.message}` });
                        }
                    }

                    // Batch check for duplicate details by comparing all columns
                    const detailChecks = detailRecords.map((d, index) => ({
                        contractId: contract.id,
                        detail: {
                            issue_date: d.record.issue_date,
                            payment_date: d.record.payment_date,
                            premium_payment: d.record.premium_payment,
                            payment_method: d.record.payment_method,
                            commission_honoraries: d.record.commission_honoraries,
                            commission_percentage: d.record.commission_percentage,
                            collection_premium: d.record.collection_premium,
                            seniority: d.record.seniority,
                            target_premium: d.record.target_premium,
                            movement: d.record.movement,
                            commission_premium: d.record.commission_premium,
                        } as Omit<ContractDetail, 'id' | 'created_at' | 'updated_at' | 'contract_id'>,
                        row: d.rowInfo.rowIndex,
                        originalIndex: index,
                    }));

                    const duplicateIndices = detailChecks.length > 0
                        ? await db.contractDetail.checkDetailsExistByAllColumns(
                            detailChecks.map(({ contractId, detail }) => ({ contractId, detail }))
                        )
                        : new Set<number>();

                    // Filter out duplicates and create records
                    const detailRecordsToInsert: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>[] = [];
                    let skippedDetails = 0;

                    for (let i = 0; i < detailRecords.length; i++) {
                        const { record, rowInfo } = detailRecords[i];
                        if (duplicateIndices.has(i)) {
                            warnings.push({ row: rowInfo.rowIndex, message: `Detalle duplicado encontrado (todos los campos coinciden). Se omitirá.` });
                            skippedDetails++;
                            continue;
                        }
                        detailRecordsToInsert.push(record);
                    }

                    // Bulk insert all details for this contract (only new ones)
                    if (detailRecordsToInsert.length > 0) {
                        await db.contractDetail.createDetails(detailRecordsToInsert);
                        detailsInsertedTotal += detailRecordsToInsert.length;

                        // Defer cobranza sync — one batched pass after all contracts
                        pendingCobranza.push({
                            contractId: contract.id,
                            details: detailRecordsToInsert.map((d) => ({
                                payment_date: d.payment_date ?? null,
                                collection_premium: d.collection_premium ?? null,
                            })),
                        });
                    } else if (skippedDetails > 0 && !isNewContract) {
                        warnings.push({ row: group.rows[0]?.rowIndex || 0, message: `All ${skippedDetails} detail(s) for contract "${group.contractNumber || 'N/A'}" were duplicates and skipped.` });
                    }

                    successCount++;
                } catch (error: any) {
                    errors.push({ row: group.rows[0]?.rowIndex || 0, error: error.message || 'Unknown error creating contract' });
                }

                const done = groupIndex + 1;
                if (done === contractTotal || done % 5 === 0 || done === 1) {
                    report(
                        "contracts",
                        done,
                        Math.max(contractTotal, 1),
                        `Importando pólizas (${done}/${contractTotal})…`,
                    );
                    // Yield so the UI can paint progress updates
                    await new Promise<void>((resolve) => setTimeout(resolve, 0));
                }
            }

            report("finalize", 0, 1, "Sincronizando cobranza…");
            if (pendingCobranza.length > 0) {
                try {
                    paymentsUpsertedTotal = await syncPaymentsFromImportedDetailsBatch(
                        supabase,
                        {
                            officeId,
                            actorUserId: importActor?.id ?? null,
                            items: pendingCobranza,
                        },
                    );
                } catch (syncErr) {
                    console.error('Cobranza import sync failed', syncErr);
                    warnings.push({
                        row: 0,
                        message:
                            'Detalles importados, pero no se pudo sincronizar cobranza en lote.',
                    });
                }
            }

            report("finalize", 1, 2, "Guardando auditoría de importación…");
            if (detailsInsertedTotal > 0 || paymentsUpsertedTotal > 0 || successCount > 0) {
                try {
                    await writeImportSyncAudit(supabase, {
                        officeId,
                        actorUserId: importActor?.id ?? null,
                        contractsTouched: successCount,
                        paymentsUpserted: paymentsUpsertedTotal,
                        detailsInserted: detailsInsertedTotal,
                    });
                } catch (auditErr) {
                    console.error('Cobranza import audit failed', auditErr);
                }
            }

            report(
                "done",
                1,
                1,
                `Listo: ${successCount} póliza(s), ${detailsInsertedTotal} detalle(s)`,
            );
            return { success: successCount, errors, warnings };
        },
    },

    // Contract Change Request functions
    contractChangeRequest: {
        getChangeRequestById: async (id: string): Promise<ContractChangeRequest | null> => {
            const { data, error } = await supabase
                .from('contract_change_request')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        getChangeRequestsByContract: async (contractId: string): Promise<ContractChangeRequest[]> => {
            const { data, error } = await supabase
                .from('contract_change_request')
                .select('*')
                .eq('contract_id', contractId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getChangeRequestsByConsultant: async (consultantId: string): Promise<ContractChangeRequest[]> => {
            // Get all contracts for this consultant, then get their change requests
            const contracts = await db.contract.getContractsByConsultant(consultantId);
            const contractIds = contracts.map(c => c.id);

            if (contractIds.length === 0) return [];

            const { data, error } = await supabase
                .from('contract_change_request')
                .select('*')
                .in('contract_id', contractIds)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getChangeRequestsByOffice: async (officeId: string): Promise<ContractChangeRequest[]> => {
            // Get all contracts for this office, then get their change requests
            const contracts = await db.contract.getContractsByOffice(officeId);
            const contractIds = contracts.map(c => c.id);

            if (contractIds.length === 0) return [];

            const { data, error } = await supabase
                .from('contract_change_request')
                .select('*')
                .in('contract_id', contractIds)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
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
                const contracts = await db.contract.getContractsByConsultant(opts.consultantId);
                contractIds = contracts.map((c) => c.id);
            } else if (opts.officeId) {
                const contracts = await db.contract.getContractsByOffice(opts.officeId);
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

        deleteChangeRequest: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('contract_change_request')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
    },

    // File functions
    file: {
        getFileById: async (id: string): Promise<File | null> => {
            const { data, error } = await supabase
                .from('file')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        createFile: async (file: Omit<File, 'id' | 'created_at' | 'updated_at'>): Promise<File> => {
            const { data, error } = await supabase
                .from('file')
                .insert(file)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        getFilesByContractId: async (contractId: string): Promise<File[]> => {
            const { data, error } = await supabase
                .from('file')
                .select('*')
                .eq('contract_id', contractId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getFilesByChangeRequestId: async (changeRequestId: string): Promise<File[]> => {
            const { data, error } = await supabase
                .from('file')
                .select('*')
                .eq('change_request_id', changeRequestId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        updateFile: async (id: string, updates: Partial<File>): Promise<File> => {
            const { data, error } = await supabase
                .from('file')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        deleteFile: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('file')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
    },

    // Client functions
    client: {
        getAllClients: async (officeId?: string): Promise<Client[]> => {
            let query = supabase.from('client').select('*').order('created_at', { ascending: false });
            if (officeId) {
                query = query.eq('office_id', officeId);
            }
            const { data, error } = await query;
            if (error) throw error;
            return data || [];
        },

        getClientsPage: async (
            opts: {
                officeId?: string;
                consultantId?: string;
                search?: string;
                registeredFrom?: string;
                registeredTo?: string;
                sort?: SortOrder;
            } & Partial<PageParams> = {},
        ): Promise<PageResult<Client & { contract_count?: number }>> => {
            const { page, pageSize } = normalizePageParams(opts);
            const { from, to } = toRange(page, pageSize);

            const sortCol =
                opts.sort?.column &&
                ['name', 'birth_date', 'created_at'].includes(opts.sort.column)
                    ? opts.sort.column
                    : 'created_at';
            const ascending = opts.sort?.ascending ?? false;

            // Consultant scope: clients linked via their contracts
            if (opts.consultantId) {
                const { data: contractRows, error: cErr } = await supabase
                    .from('contract')
                    .select('client_id')
                    .eq('consultant_id', opts.consultantId)
                    .not('client_id', 'is', null);
                if (cErr) throw cErr;
                const clientIds = [
                    ...new Set(
                        (contractRows || [])
                            .map((r: { client_id: string | null }) => r.client_id)
                            .filter((id): id is string => !!id),
                    ),
                ];
                if (clientIds.length === 0) return emptyPageResult(opts);

                let query = supabase
                    .from('client')
                    .select('*', { count: 'exact' })
                    .in('id', clientIds)
                    .order(sortCol, { ascending, nullsFirst: false })
                    .range(from, to);

                const search = opts.search?.trim();
                if (search) query = query.ilike('name', `%${search}%`);
                if (opts.registeredFrom) query = query.gte('created_at', opts.registeredFrom);
                if (opts.registeredTo) {
                    query = query.lte('created_at', `${opts.registeredTo}T23:59:59.999Z`);
                }

                const { data, error, count } = await query;
                if (error) throw error;

                const rows = await attachContractCounts((data as Client[]) || []);
                return { rows, total: count ?? 0, page, pageSize };
            }

            let query = supabase
                .from('client')
                .select('*', { count: 'exact' })
                .order(sortCol, { ascending, nullsFirst: false })
                .range(from, to);

            if (opts.officeId) {
                query = query.eq('office_id', opts.officeId);
            }

            const search = opts.search?.trim();
            if (search) query = query.ilike('name', `%${search}%`);
            if (opts.registeredFrom) query = query.gte('created_at', opts.registeredFrom);
            if (opts.registeredTo) {
                query = query.lte('created_at', `${opts.registeredTo}T23:59:59.999Z`);
            }

            const { data, error, count } = await query;
            if (error) throw error;

            const rows = await attachContractCounts((data as Client[]) || []);
            return { rows, total: count ?? 0, page, pageSize };
        },

        getClientsByConsultant: async (consultantId: string): Promise<Client[]> => {
            // Use a single query with join to get clients directly
            const { data, error } = await supabase
                .from('contract')
                .select('client_id, client:client_id(*)')
                .eq('consultant_id', consultantId)
                .not('client_id', 'is', null);

            if (error) throw error;
            if (!data) return [];

            // Extract unique clients from the joined data
            const clientMap = new Map<string, Client>();
            data.forEach((item: any) => {
                if (item.client && item.client.id) {
                    clientMap.set(item.client.id, item.client);
                }
            });

            return Array.from(clientMap.values()).sort((a, b) => {
                const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
                const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
                return dateB - dateA;
            });
        },

        getClientById: async (id: string): Promise<Client | null> => {
            const { data, error } = await supabase
                .from('client')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

        createClient: async (name: string, birthDate?: string, officeId?: string | null): Promise<Client> => {
            const { data, error } = await supabase
                .from('client')
                .insert({
                    name,
                    birth_date: birthDate || null,
                    office_id: officeId ?? null,
                })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        updateClient: async (id: string, updates: Partial<Client>): Promise<Client> => {
            const { data, error } = await supabase
                .from('client')
                .update({
                    ...updates,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        deleteClient: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('client')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },

        findOrCreateClientByName: async (name: string, officeId?: string | null): Promise<Client> => {
            let query = supabase.from('client').select('*').ilike('name', name.trim()).limit(1);
            if (officeId) query = query.eq('office_id', officeId);
            const { data: existing, error: searchError } = await query.maybeSingle();

            if (searchError && searchError.code !== 'PGRST116') {
                throw searchError;
            }

            if (existing) {
                return existing;
            }

            return await db.client.createClient(name.trim(), undefined, officeId);
        },

        checkClientExists: async (name: string): Promise<boolean> => {
            const { data, error } = await supabase
                .from('client')
                .select('id')
                .ilike('name', name.trim())
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        },

        findOrCreateClientsByName: async (names: string[], officeId?: string | null): Promise<Map<string, Client>> => {
            const clientMap = new Map<string, Client>();
            const uniqueNames = [
                ...new Set(
                    names
                        .map((n) => n.trim())
                        .filter((n) => n.length > 0),
                ),
            ];

            if (uniqueNames.length === 0) return clientMap;

            const wantedKeys = new Set(uniqueNames.map((n) => n.toLowerCase()));

            // Avoid PostgREST `.or(name.ilike.First Last)` which breaks on spaces.
            // Load office clients (or match by exact name chunks) and join in memory.
            let existing: Client[] = [];
            if (officeId) {
                const { data, error: searchError } = await supabase
                    .from('client')
                    .select('*')
                    .eq('office_id', officeId);
                if (searchError) throw searchError;
                existing = (data as Client[]) || [];
            } else {
                // Chunk exact-name lookups when no office scope
                for (const chunk of chunkArray(uniqueNames, IMPORT_BATCH_SIZE)) {
                    const { data, error: searchError } = await supabase
                        .from('client')
                        .select('*')
                        .in('name', chunk);
                    if (searchError) throw searchError;
                    existing.push(...((data as Client[]) || []));
                }
            }

            for (const client of existing) {
                const key = (client.name || '').trim().toLowerCase();
                if (key && wantedKeys.has(key) && !clientMap.has(key)) {
                    clientMap.set(key, client);
                }
            }

            const namesToCreate = uniqueNames.filter(
                (name) => !clientMap.has(name.toLowerCase()),
            );

            for (const chunk of chunkArray(namesToCreate, IMPORT_BATCH_SIZE)) {
                const { data: newClients, error: createError } = await supabase
                    .from('client')
                    .insert(
                        chunk.map((name) => ({
                            name,
                            birth_date: null,
                            office_id: officeId ?? null,
                        })),
                    )
                    .select();

                if (createError) throw createError;

                for (const client of (newClients as Client[]) || []) {
                    const key = (client.name || '').trim().toLowerCase();
                    if (key) clientMap.set(key, client);
                }
            }

            return clientMap;
        },
    },

    // Contract Detail functions
    contractDetail: {
        getDetailById: async (id: string): Promise<ContractDetail | null> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .select('*')
                .eq('id', id)
                .maybeSingle();

            if (error) throw error;
            return data;
        },

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

        checkDetailExists: async (contractId: string, ticketNumber: string | null): Promise<boolean> => {
            if (!ticketNumber) return false;
            const { data, error } = await supabase
                .from('contract_detail')
                .select('id')
                .eq('contract_id', contractId)
                .eq('ticket_number', ticketNumber)
                .limit(1)
                .maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        },

        checkDetailsExist: async (checks: Array<{ contractId: string; ticketNumber: string }>): Promise<Set<string>> => {
            // Batch check multiple details at once
            if (checks.length === 0) return new Set();

            // Group by contract_id to optimize queries
            const byContract = new Map<string, string[]>();
            checks.forEach(({ contractId, ticketNumber }) => {
                if (!ticketNumber) return;
                if (!byContract.has(contractId)) {
                    byContract.set(contractId, []);
                }
                byContract.get(contractId)!.push(ticketNumber);
            });

            const existingSet = new Set<string>();

            // Query each contract's details in batch
            for (const [contractId, ticketNumbers] of byContract.entries()) {
                const { data, error } = await supabase
                    .from('contract_detail')
                    .select('ticket_number')
                    .eq('contract_id', contractId)
                    .in('ticket_number', ticketNumbers);

                if (error) throw error;

                if (data) {
                    data.forEach((detail: any) => {
                        if (detail.ticket_number) {
                            existingSet.add(`${contractId}:${detail.ticket_number}`);
                        }
                    });
                }
            }

            return existingSet;
        },

        // Check if a detail exists by comparing all columns
        checkDetailExistsByAllColumns: async (detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>): Promise<boolean> => {
            // Build query to check all columns
            let query = supabase
                .from('contract_detail')
                .select('id')
                .eq('contract_id', detail.contract_id);

            // Add conditions for all fields
            if (detail.issue_date !== null && detail.issue_date !== undefined) {
                query = query.eq('issue_date', detail.issue_date);
            } else {
                query = query.is('issue_date', null);
            }

            if (detail.payment_date !== null && detail.payment_date !== undefined) {
                query = query.eq('payment_date', detail.payment_date);
            } else {
                query = query.is('payment_date', null);
            }

            if (detail.premium_payment !== null && detail.premium_payment !== undefined) {
                query = query.eq('premium_payment', detail.premium_payment);
            } else {
                query = query.is('premium_payment', null);
            }

            if (detail.payment_method !== null && detail.payment_method !== undefined) {
                query = query.eq('payment_method', detail.payment_method);
            } else {
                query = query.is('payment_method', null);
            }

            if (detail.commission_honoraries !== null && detail.commission_honoraries !== undefined) {
                query = query.eq('commission_honoraries', detail.commission_honoraries);
            } else {
                query = query.is('commission_honoraries', null);
            }

            if (detail.commission_percentage !== null && detail.commission_percentage !== undefined) {
                query = query.eq('commission_percentage', detail.commission_percentage);
            } else {
                query = query.is('commission_percentage', null);
            }

            if (detail.collection_premium !== null && detail.collection_premium !== undefined) {
                query = query.eq('collection_premium', detail.collection_premium);
            } else {
                query = query.is('collection_premium', null);
            }

            if (detail.seniority !== null && detail.seniority !== undefined) {
                query = query.eq('seniority', detail.seniority);
            } else {
                query = query.is('seniority', null);
            }

            if (detail.target_premium !== null && detail.target_premium !== undefined) {
                query = query.eq('target_premium', detail.target_premium);
            } else {
                query = query.is('target_premium', null);
            }

            if (detail.movement !== null && detail.movement !== undefined) {
                query = query.eq('movement', detail.movement);
            } else {
                query = query.is('movement', null);
            }

            if (detail.commission_premium !== null && detail.commission_premium !== undefined) {
                query = query.eq('commission_premium', detail.commission_premium);
            } else {
                query = query.is('commission_premium', null);
            }

            const { data, error } = await query.limit(1).maybeSingle();

            if (error && error.code !== 'PGRST116') throw error;
            return !!data;
        },

        // Batch check multiple details by comparing all columns
        checkDetailsExistByAllColumns: async (details: Array<{ contractId: string; detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at' | 'contract_id'> }>): Promise<Set<number>> => {
            // Returns a Set of indices (from the input array) that are duplicates
            const duplicateIndices = new Set<number>();

            if (details.length === 0) return duplicateIndices;

            // Group by contract_id to optimize queries
            const byContract = new Map<string, Array<{ index: number; detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at' | 'contract_id'> }>>();
            details.forEach(({ contractId, detail }, index) => {
                if (!byContract.has(contractId)) {
                    byContract.set(contractId, []);
                }
                byContract.get(contractId)!.push({ index, detail });
            });

            // For each contract, load all existing details and compare
            for (const [contractId, detailList] of byContract.entries()) {
                // Load all existing details for this contract
                const { data: existingDetails, error } = await supabase
                    .from('contract_detail')
                    .select('*')
                    .eq('contract_id', contractId);

                if (error) throw error;

                if (!existingDetails || existingDetails.length === 0) continue;

                // Compare each new detail against all existing ones
                for (const { index, detail: newDetail } of detailList) {
                    const detailWithContractId: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'> = {
                        ...newDetail,
                        contract_id: contractId,
                    };

                    // Check if this detail matches any existing detail (comparing all fields)
                    // For numeric fields, compare numbers directly (handling nulls)
                    const isDuplicate = existingDetails.some((existing: ContractDetail) => {
                        // Helper to compare values (handles null and numeric comparison)
                        const compareValues = (a: any, b: any): boolean => {
                            if (a === null || a === undefined) return (b === null || b === undefined);
                            if (b === null || b === undefined) return false;
                            // For numbers, use numeric comparison to handle precision
                            if (typeof a === 'number' && typeof b === 'number') {
                                return Math.abs(a - b) < 0.01; // Allow small floating point differences
                            }
                            return a === b;
                        };

                        return (
                            compareValues(existing.issue_date, detailWithContractId.issue_date) &&
                            compareValues(existing.payment_date, detailWithContractId.payment_date) &&
                            compareValues(existing.premium_payment, detailWithContractId.premium_payment) &&
                            compareValues(existing.payment_method, detailWithContractId.payment_method) &&
                            compareValues(existing.commission_honoraries, detailWithContractId.commission_honoraries) &&
                            compareValues(existing.commission_percentage, detailWithContractId.commission_percentage) &&
                            compareValues(existing.collection_premium, detailWithContractId.collection_premium) &&
                            compareValues(existing.seniority, detailWithContractId.seniority) &&
                            compareValues(existing.target_premium, detailWithContractId.target_premium) &&
                            compareValues(existing.movement, detailWithContractId.movement) &&
                            compareValues(existing.commission_premium, detailWithContractId.commission_premium)
                        );
                    });

                    if (isDuplicate) {
                        duplicateIndices.add(index);
                    }
                }
            }

            return duplicateIndices;
        },

        createDetail: async (detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>): Promise<ContractDetail> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .insert(detail)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        createDetails: async (details: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>[]): Promise<ContractDetail[]> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .insert(details)
                .select();

            if (error) throw error;
            return data || [];
        },

        updateDetail: async (id: string, updates: Partial<ContractDetail>): Promise<ContractDetail> => {
            const { data, error } = await supabase
                .from('contract_detail')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        deleteDetail: async (id: string): Promise<void> => {
            const { error } = await supabase
                .from('contract_detail')
                .delete()
                .eq('id', id);

            if (error) throw error;
        },
    },

    // Dashboard/Statistics functions (all calculations done in SQL via RPC)
    dashboard: {
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

        // Get total prima pago and prima meta for a consultant (calculated in SQL via RPC)
        getConsultantTotals: async (consultantId: string, startDate?: string | null, endDate?: string | null, seniority?: string | null): Promise<{ totalPrimaPago: number; totalPrimaMeta: number }> => {
            const { data, error } = await supabase.rpc('get_consultant_totals', {
                consultant_id_param: consultantId,
                start_date: startDate || null,
                end_date: endDate || null,
                seniority_param: seniority || null,
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

        getOfficeConsultantsSales: async (officeId: string, startDate?: string | null, endDate?: string | null, dateBasis: 'payment' | 'issue' = 'payment', seniorityMin?: number | null, seniorityMax?: number | null, consultantIds?: string[] | null, contractTypeFilter?: 'VI' | 'GM' | null, paymentMethodFilter?: string | null): Promise<Array<{ consultant_id: string; total_sales: number }>> => {
            const { data, error } = await supabase.rpc('get_office_consultants_sales', {
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
            if (!data || data.length === 0) return [];

            return data.map((row: any) => ({
                consultant_id: row.consultant_id,
                total_sales: parseFloat(row.total_sales || '0') || 0,
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

        // Get consultant totals by contract type (VI and GM) - prima pago and prima meta
        getConsultantTotalsByType: async (consultantId: string, startDate?: string | null, endDate?: string | null, seniority?: string | null): Promise<{ primaPagoVI: number; primaPagoGM: number; primaMetaVI: number; primaMetaGM: number }> => {
            const { data, error } = await supabase.rpc('get_consultant_totals_by_type', {
                consultant_id_param: consultantId,
                start_date: startDate || null,
                end_date: endDate || null,
                seniority_param: seniority || null,
            });

            if (error) throw error;
            if (!data || data.length === 0) {
                return { primaPagoVI: 0, primaPagoGM: 0, primaMetaVI: 0, primaMetaGM: 0 };
            }

            return {
                primaPagoVI: parseFloat(data[0].prima_pago_vi || '0') || 0,
                primaPagoGM: parseFloat(data[0].prima_pago_gm || '0') || 0,
                primaMetaVI: parseFloat(data[0].prima_meta_vi || '0') || 0,
                primaMetaGM: parseFloat(data[0].prima_meta_gm || '0') || 0,
            };
        },
    },

    // Search functions
    search: {
        searchContracts: async (query: string, officeId?: string): Promise<Contract[]> => {
            let queryBuilder = supabase
                .from('contract')
                .select('*')
                .or(`contract_number.ilike.%${query}%,project_name.ilike.%${query}%`)
                .limit(10);

            // If officeId is provided, filter by office
            if (officeId) {
                queryBuilder = queryBuilder
                    .select('*, consultant:consultant_id(office_id)')
                    .eq('consultant.office_id', officeId);
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
    },
};

