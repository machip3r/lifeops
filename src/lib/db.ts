import { supabase, supabaseAdmin } from './supabase';
import type { Office, Consultant, Client, Contract, ContractChangeRequest, File, ContractDetail } from './supabase';

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

        getAdminOfficeById: async (id: string): Promise<Office | null> => {
            const { data, error } = await supabaseAdmin
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
            const { error } = await supabase
                .from('token')
                .update({
                    used_at: new Date().toISOString(),
                    status: 'USED',
                })
                .eq('id', id);

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
            headers?: string[] // Table headers to map columns correctly
        ): Promise<{ success: number; errors: Array<{ row: number; error: string }>; warnings: Array<{ row: number; message: string }> }> => {
            const errors: Array<{ row: number; error: string }> = [];
            const warnings: Array<{ row: number; message: string }> = [];
            let successCount = 0;

            // Group rows by contract (Cliente + Poliza + Asesor)
            // First 4 columns are: Cliente, Poliza, Moneda, Asesor
            // Rest are detail columns
            type ContractGroup = {
                cliente: string;
                poliza: string;
                moneda: string;
                asesor: string;
                rows: Array<{ rowIndex: number; data: string[] }>;
            };

            const contractGroups = new Map<string, ContractGroup>();

            // Group rows by contract
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    if (row.length < 4) {
                        errors.push({ row: i + 1, error: 'Row does not have enough columns' });
                        continue;
                    }

                    const cliente = row[0]?.trim();
                    const poliza = row[1]?.trim();
                    const moneda = row[2]?.trim();
                    const asesor = row[3]?.trim(); // This is the consultant_code

                    if (!cliente || !asesor) {
                        errors.push({ row: i + 1, error: 'Missing Cliente or Asesor (Consultant Code)' });
                        continue;
                    }

                    // Create unique key for contract grouping
                    const contractKey = `${cliente}|${poliza}|${asesor}`;

                    if (!contractGroups.has(contractKey)) {
                        contractGroups.set(contractKey, {
                            cliente,
                            poliza,
                            moneda,
                            asesor,
                            rows: [],
                        });
                    }

                    // Add this row to the contract group (skip first 4 columns as they're contract-level)
                    contractGroups.get(contractKey)!.rows.push({
                        rowIndex: i + 1,
                        data: row.slice(4), // All columns after the first 4 are detail columns
                    });
                } catch (error: any) {
                    errors.push({ row: i + 1, error: error.message || 'Error grouping row' });
                }
            }

            // Pre-fetch consultants in batch (if not using consultantId)
            const consultantCache = new Map<string, Consultant>();
            if (!consultantId) {
                const uniqueAsesores = [...new Set(Array.from(contractGroups.values()).map(g => g.asesor))];
                for (const asesor of uniqueAsesores) {
                    const consultant = await db.consultant.findConsultantByCode(asesor, officeId);
                    if (consultant) {
                        consultantCache.set(asesor.toLowerCase(), consultant);
                    }
                }
            } else {
                const consultant = await db.consultant.getConsultantById(consultantId);
                if (consultant) {
                    consultantCache.set(consultant.consultant_code?.toLowerCase() || '', consultant);
                }
            }

            // Pre-fetch existing contracts in batch
            const polizasToCheck = Array.from(contractGroups.values())
                .map(g => g.poliza)
                .filter((p): p is string => !!p);

            const existingContractsMap = new Map<string, Contract>();
            if (polizasToCheck.length > 0) {
                const { data: existingContracts } = await supabase
                    .from('contract')
                    .select('*')
                    .in('contract_number', polizasToCheck);

                if (existingContracts) {
                    existingContracts.forEach((c: Contract) => {
                        if (c.contract_number) {
                            existingContractsMap.set(c.contract_number, c);
                        }
                    });
                }
            }

            // Pre-fetch clients in batch (single query for all clients)
            const uniqueClientes = [...new Set(Array.from(contractGroups.values()).map(g => g.cliente))];
            const clientCache = await db.client.findOrCreateClientsByName(uniqueClientes);

            // Process each contract group
            for (const [contractKey, group] of contractGroups.entries()) {
                try {
                    // Find consultant from cache
                    let consultant: Consultant | undefined;
                    if (consultantId) {
                        consultant = consultantCache.get('');
                        if (consultant && consultant.consultant_code?.toLowerCase() !== group.asesor.toLowerCase()) {
                            errors.push({ row: group.rows[0]?.rowIndex || 0, error: `Consultant code "${group.asesor}" does not match your account.` });
                            continue;
                        }
                    } else {
                        consultant = consultantCache.get(group.asesor.toLowerCase());
                    }

                    if (!consultant) {
                        errors.push({ row: group.rows[0]?.rowIndex || 0, error: `Consultant with code "${group.asesor}" not found.` });
                        continue;
                    }

                    if (!consultant.id) {
                        errors.push({ row: group.rows[0]?.rowIndex || 0, error: `Consultant "${group.asesor}" has no ID` });
                        continue;
                    }

                    // Get client from cache
                    const client = clientCache.get(group.cliente.toLowerCase());
                    if (!client) {
                        errors.push({ row: group.rows[0]?.rowIndex || 0, error: `Client "${group.cliente}" not found` });
                        continue;
                    }

                    // Check if contract already exists (from pre-fetched map)
                    let contract: Contract;
                    let isNewContract = false;
                    if (group.poliza) {
                        const existing = existingContractsMap.get(group.poliza);
                        if (existing) {
                            // Contract exists, use it
                            warnings.push({ row: group.rows[0]?.rowIndex || 0, message: `Contract with poliza "${group.poliza}" already exists. Skipping contract creation, will only add new details.` });
                            contract = existing;
                        } else {
                            // Create new contract
                            contract = await db.contract.createContract({
                                consultant_id: consultant.id,
                                client_id: client.id,
                                contract_number: group.poliza,
                                currency: group.moneda || null,
                                status: 'PENDING',
                            });
                            isNewContract = true;
                            // Add to cache for potential future use
                            existingContractsMap.set(group.poliza, contract);
                        }
                    } else {
                        // No poliza, create new contract anyway
                        contract = await db.contract.createContract({
                            consultant_id: consultant.id,
                            client_id: client.id,
                            contract_number: null,
                            currency: group.moneda || null,
                            status: 'PENDING',
                        });
                        isNewContract = true;
                    }

                    // Prepare all detail records first, then batch check for duplicates
                    const detailRecords: Array<{ record: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>; rowInfo: { rowIndex: number; data: string[] } }> = [];

                    // Map columns helper
                    const mapColumn = (detailData: string[], index: number): string | null => {
                        if (index >= detailData.length) return null;
                        const value = detailData[index]?.trim();
                        return value || null;
                    };

                    // Parse dates helper
                    const parseDate = (dateStr: string | null): string | null => {
                        if (!dateStr || !dateStr.trim()) return null;
                        const parts = dateStr.trim().split('/');
                        if (parts.length === 3) {
                            const day = parts[0].padStart(2, '0');
                            const month = parts[1].padStart(2, '0');
                            const year = parts[2];
                            return `${year}-${month}-${day}`;
                        }
                        return null;
                    };

                    // Prepare all details
                    for (const rowInfo of group.rows) {
                        try {
                            const detailData = rowInfo.data;
                            const ticketNumber = mapColumn(detailData, 0); // RECIBO

                            const detail: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'> = {
                                contract_id: contract.id,
                                ticket_number: ticketNumber,
                                plan: mapColumn(detailData, 1),
                                issue_date: parseDate(mapColumn(detailData, 2)),
                                product: mapColumn(detailData, 3),
                                expiration_date: parseDate(mapColumn(detailData, 4)),
                                payment_date: parseDate(mapColumn(detailData, 5)),
                                premium_payment: mapColumn(detailData, 6),
                                payment_method: mapColumn(detailData, 7),
                                unit_value: mapColumn(detailData, 8),
                                participation_percentage: mapColumn(detailData, 9),
                                commission_premium: mapColumn(detailData, 10),
                                commission_honoraries: mapColumn(detailData, 11),
                                condition: mapColumn(detailData, 12),
                                commission_percentage: mapColumn(detailData, 13),
                                movement: mapColumn(detailData, 14),
                                collection_premium: mapColumn(detailData, 15),
                                promotional_collection_premium: mapColumn(detailData, 16),
                                incremental_premium: mapColumn(detailData, 17),
                                seniority: mapColumn(detailData, 18),
                                generation_date: parseDate(mapColumn(detailData, 19)),
                                group_name: mapColumn(detailData, 20),
                                index_premium: mapColumn(detailData, 21),
                                target_premium: mapColumn(detailData, 23),
                                row_data: {},
                            };

                            detailRecords.push({ record: detail, rowInfo });
                        } catch (error: any) {
                            errors.push({ row: rowInfo.rowIndex, error: `Error creating detail: ${error.message}` });
                        }
                    }

                    // Batch check for duplicate details
                    const detailChecks = detailRecords
                        .filter(d => d.record.ticket_number)
                        .map(d => ({ contractId: contract.id, ticketNumber: d.record.ticket_number! }));

                    const existingDetails = detailChecks.length > 0
                        ? await db.contractDetail.checkDetailsExist(detailChecks)
                        : new Set<string>();

                    // Filter out duplicates and create records
                    const detailRecordsToInsert: Omit<ContractDetail, 'id' | 'created_at' | 'updated_at'>[] = [];
                    let skippedDetails = 0;

                    for (const { record, rowInfo } of detailRecords) {
                        if (record.ticket_number) {
                            const key = `${contract.id}:${record.ticket_number}`;
                            if (existingDetails.has(key)) {
                                warnings.push({ row: rowInfo.rowIndex, message: `Detail with ticket number "${record.ticket_number}" already exists for this contract. Skipping duplicate.` });
                                skippedDetails++;
                                continue;
                            }
                        }
                        detailRecordsToInsert.push(record);
                    }

                    // Bulk insert all details for this contract (only new ones)
                    if (detailRecordsToInsert.length > 0) {
                        await db.contractDetail.createDetails(detailRecordsToInsert);
                    } else if (skippedDetails > 0 && !isNewContract) {
                        warnings.push({ row: group.rows[0]?.rowIndex || 0, message: `All ${skippedDetails} detail(s) for contract "${group.poliza || 'N/A'}" were duplicates and skipped.` });
                    }

                    successCount++;
                } catch (error: any) {
                    errors.push({ row: group.rows[0]?.rowIndex || 0, error: error.message || 'Unknown error creating contract' });
                }
            }

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
        getAllClients: async (): Promise<Client[]> => {
            const { data, error } = await supabase
                .from('client')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
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

        createClient: async (name: string, birthDate?: string): Promise<Client> => {
            const { data, error } = await supabase
                .from('client')
                .insert({
                    name,
                    birth_date: birthDate || null,
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

        findOrCreateClientByName: async (name: string): Promise<Client> => {
            // First try to find existing client by name (case-insensitive)
            const { data: existing, error: searchError } = await supabase
                .from('client')
                .select('*')
                .ilike('name', name.trim())
                .limit(1)
                .maybeSingle();

            if (searchError && searchError.code !== 'PGRST116') { // PGRST116 = no rows returned
                throw searchError;
            }

            if (existing) {
                return existing;
            }

            // Create new client
            return await db.client.createClient(name.trim());
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

        findOrCreateClientsByName: async (names: string[]): Promise<Map<string, Client>> => {
            // Batch find or create multiple clients
            const clientMap = new Map<string, Client>();
            const uniqueNames = [...new Set(names.map(n => n.trim()))];

            if (uniqueNames.length === 0) return clientMap;

            // Find all existing clients in one query using OR conditions
            const orConditions = uniqueNames.map(name => `name.ilike.${name}`).join(',');
            const { data: existingClients, error: searchError } = await supabase
                .from('client')
                .select('*')
                .or(orConditions);

            if (searchError && searchError.code !== 'PGRST116') {
                throw searchError;
            }

            // Map existing clients by lowercase name
            const existingMap = new Map<string, Client>();
            if (existingClients) {
                existingClients.forEach((client: Client) => {
                    const key = client.name.toLowerCase();
                    existingMap.set(key, client);
                    clientMap.set(key, client);
                });
            }

            // Create missing clients in batch
            const namesToCreate = uniqueNames.filter(name => {
                const key = name.toLowerCase();
                return !existingMap.has(key);
            });

            if (namesToCreate.length > 0) {
                const clientsToCreate = namesToCreate.map(name => ({
                    name: name,
                    birth_date: null,
                }));

                const { data: newClients, error: createError } = await supabase
                    .from('client')
                    .insert(clientsToCreate)
                    .select();

                if (createError) throw createError;

                if (newClients) {
                    newClients.forEach((client: Client) => {
                        const key = client.name.toLowerCase();
                        clientMap.set(key, client);
                    });
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
};

