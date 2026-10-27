import type { SupabaseClient } from '@supabase/supabase-js';
import type { AuditSource, Client, ClientPortfolio, ClientPortfolioFilter } from '@/lib/supabase';
import { normalizeClientName } from '@/lib/clients/name-match';
import { auditDiff, writeAuditLog, type AuditActor } from './audit-log';
import type { EditResult } from './edit-result';
import { IMPORT_BATCH_SIZE, chunkArray } from '@/lib/extractor/batch';
import { emptyPageResult, normalizePageParams, toRange, type PageParams, type PageResult, type SortOrder } from '@/lib/pagination';

/** `client` table access (RLS-scoped client: browser session or user JWT). */
export function createClientDb(supabase: SupabaseClient) {
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

    const clientDb = {
        /** Clientes page with contact, pólizas activas and cartera status (`list_client_portfolio`). */
        listPortfolio: async (opts: {
            officeId?: string;
            consultantId?: string;
            search?: string;
            status?: ClientPortfolioFilter | null;
            sort?: SortOrder;
            riskDays: number;
            dueSoonDays: number;
        } & Partial<PageParams>): Promise<ClientPortfolio> => {
            const { page, pageSize } = normalizePageParams(opts);
            const { data, error } = await supabase.rpc('list_client_portfolio', {
                office_id_param: opts.officeId ?? null,
                consultant_id_param: opts.consultantId ?? null,
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
            return data as ClientPortfolio;
        },

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

        createClient: async (
            name: string,
            birthDate?: string,
            officeId?: string | null,
            identity?: { curp?: string | null; rfc?: string | null },
        ): Promise<Client> => {
            const curp = identity?.curp?.trim().toUpperCase() || null;
            const rfc = identity?.rfc?.trim().toUpperCase() || null;
            if (!officeId && !curp && !rfc) {
                throw new Error('Cliente local requiere office_id, o bien CURP/RFC.');
            }
            const { data, error } = await supabase
                .from('client')
                .insert({
                    name,
                    birth_date: birthDate || null,
                    office_id: officeId ?? null,
                    curp,
                    rfc,
                })
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('Ya existe un cliente con ese CURP o RFC.');
                }
                throw error;
            }
            return data;
        },

        /**
         * Hybrid find-or-create: CURP → RFC → name+office (local).
         * Prefer strong IDs when present; never create a duplicate CURP/RFC.
         */
        findOrCreateClient: async (params: {
            name: string;
            officeId?: string | null;
            birthDate?: string | null;
            curp?: string | null;
            rfc?: string | null;
        }): Promise<Client> => {
            const name = params.name.trim();
            const curp = params.curp?.trim().toUpperCase() || null;
            const rfc = params.rfc?.trim().toUpperCase() || null;
            const officeId = params.officeId ?? null;

            if (curp) {
                const { data: byCurp, error } = await supabase
                    .from('client')
                    .select('*')
                    .ilike('curp', curp)
                    .maybeSingle();
                if (error && error.code !== 'PGRST116') throw error;
                if (byCurp) {
                    if (!byCurp.name?.trim() && name) {
                        return await clientDb.updateClient(byCurp.id, { name });
                    }
                    return byCurp;
                }
            }

            if (rfc) {
                const { data: byRfc, error } = await supabase
                    .from('client')
                    .select('*')
                    .ilike('rfc', rfc)
                    .maybeSingle();
                if (error && error.code !== 'PGRST116') throw error;
                if (byRfc) {
                    if (!byRfc.name?.trim() && name) {
                        return await clientDb.updateClient(byRfc.id, { name });
                    }
                    return byRfc;
                }
            }

            if (!officeId && !curp && !rfc) {
                throw new Error('Cliente local requiere office_id, o bien CURP/RFC.');
            }

            if (officeId) {
                const query = supabase.from('client').select('*').ilike('name', name).eq('office_id', officeId).limit(1);
                const { data: existing, error: searchError } = await query.maybeSingle();
                if (searchError && searchError.code !== 'PGRST116') throw searchError;
                if (existing) {
                    const updates: Partial<Client> = {};
                    if (curp && !existing.curp) updates.curp = curp;
                    if (rfc && !existing.rfc) updates.rfc = rfc;
                    if (Object.keys(updates).length > 0) {
                        return await clientDb.updateClient(existing.id, updates);
                    }
                    return existing;
                }
            }

            return await clientDb.createClient(name, params.birthDate ?? undefined, officeId, { curp, rfc });
        },

        findOrCreateClientByName: async (name: string, officeId?: string | null): Promise<Client> => {
            return await clientDb.findOrCreateClient({ name: name.trim(), officeId });
        },

        updateClient: async (id: string, updates: Partial<Client>): Promise<Client> => {
            const payload: Partial<Client> = { ...updates };
            if (payload.curp != null) {
                payload.curp = String(payload.curp).trim().toUpperCase() || null;
            }
            if (payload.rfc != null) {
                payload.rfc = String(payload.rfc).trim().toUpperCase() || null;
            }
            const { data, error } = await supabase
                .from('client')
                .update({
                    ...payload,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505') {
                    throw new Error('Ya existe un cliente con ese CURP o RFC.');
                }
                throw error;
            }
            return data;
        },

        /** Edit a client (RLS-scoped) and log only the changed fields as `client.update`. */
        updateWithAudit: async (
            id: string,
            patch: Partial<Client>,
            actor: AuditActor,
            source: AuditSource = 'ui',
        ): Promise<EditResult<Client>> => {
            const { data: before, error: readError } = await supabase
                .from('client')
                .select('*')
                .eq('id', id)
                .maybeSingle();
            if (readError) throw readError;
            if (!before) return { ok: false, error: 'No encontramos al cliente.' };

            const { oldValues, newValues } = auditDiff(before, patch);
            if (Object.keys(newValues).length === 0) return { ok: true, data: before as Client };

            const { data, error } = await supabase
                .from('client')
                .update({ ...newValues, updated_at: new Date().toISOString() })
                .eq('id', id)
                .select()
                .single();
            if (error) {
                if (error.code === '23505') {
                    return {
                        ok: false,
                        error: 'Ya existe otro cliente con ese CURP o RFC.',
                        fieldErrors: 'curp' in newValues
                            ? { curp: 'Ya existe otro cliente con esa CURP.' }
                            : { rfc: 'Ya existe otro cliente con ese RFC.' },
                    };
                }
                throw error;
            }

            await writeAuditLog(supabase, {
                officeId: actor.officeId,
                actorUserId: actor.userId,
                actorRole: actor.role,
                action: 'client.update',
                entityType: 'client',
                entityId: id,
                source,
                oldValues: { ...oldValues, name: before.name },
                newValues: { ...newValues, name: data.name },
            });
            return { ok: true, data: data as Client };
        },

        listClientNames: async (officeId: string): Promise<string[]> => {
            const pageSize = 1000;
            const names: string[] = [];
            let from = 0;
            for (;;) {
                const { data, error } = await supabase
                    .from('client')
                    .select('name')
                    .eq('office_id', officeId)
                    .range(from, from + pageSize - 1);
                if (error) throw error;
                const rows = data || [];
                for (const row of rows) {
                    if (row.name) names.push(row.name);
                }
                if (rows.length < pageSize) break;
                from += pageSize;
            }
            return names;
        },

        findOrCreateClientsByName: async (names: string[], officeId?: string | null): Promise<Map<string, Client>> => {
            const clientMap = new Map<string, Client>();
            const uniqueNames = [
                ...new Set(
                    names
                        .map((n) => normalizeClientName(n))
                        .filter((n) => n.length > 0),
                ),
            ];

            if (uniqueNames.length === 0) return clientMap;

            const wantedKeys = new Set(uniqueNames.map((n) => n.toLowerCase()));

            // Avoid PostgREST `.or(name.ilike.First Last)` which breaks on spaces.
            // Load office clients and match on the normalized name.
            const existing: Client[] = [];
            if (officeId) {
                const pageSize = 1000;
                let from = 0;
                for (;;) {
                    const { data, error: searchError } = await supabase
                        .from('client')
                        .select('*')
                        .eq('office_id', officeId)
                        .range(from, from + pageSize - 1);
                    if (searchError) throw searchError;
                    const rows = (data as Client[]) || [];
                    existing.push(...rows);
                    if (rows.length < pageSize) break;
                    from += pageSize;
                }
            } else {
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
                const normalized = normalizeClientName(client.name || '');
                const key = normalized.toLowerCase();
                if (!key || !wantedKeys.has(key) || clientMap.has(key)) continue;
                if (normalized !== (client.name || '').trim()) {
                    try {
                        const updated = await clientDb.updateClient(client.id, { name: normalized });
                        clientMap.set(key, updated);
                        continue;
                    } catch (error) {
                        console.error('normalize client name:', error);
                    }
                }
                clientMap.set(key, client);
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
                    const key = normalizeClientName(client.name || '').toLowerCase();
                    if (key) clientMap.set(key, client);
                }
            }

            return clientMap;
        },
    };

    return clientDb;
}
