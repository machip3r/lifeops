import { supabase, supabaseAdmin } from './supabase';
import type { Office, Consultant, Client, Contract, ContractChangeRequest, File } from './supabase';

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
            const { data, error } = await supabase
                .from('consultant')
                .select('*')
                .eq('id', id)
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

        findOrCreateConsultantByName: async (name: string, officeId: string): Promise<Consultant> => {
            // First try to find existing consultant by name
            const existing = await db.consultant.findConsultantByName(name, officeId);
            if (existing) {
                return existing;
            }

            // Create new consultant with empty values
            // Generate a temporary UUID for the id (will be updated when consultant is invited)
            const tempId = crypto.randomUUID();
            
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
                    id: tempId, // Temporary ID, will be updated when invited
                    office_id: officeId,
                    name: name.trim(),
                    email: null, // Will be filled when consultant is invited
                    consultant_code: tempCode, // Temporary code, can be updated
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

        getContractsByConsultant: async (consultantId: string): Promise<Contract[]> => {
            const { data, error } = await supabase
                .from('contract')
                .select('*')
                .eq('consultant_id', consultantId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        },

        getContractsByOffice: async (officeId: string): Promise<Contract[]> => {
            // Get all consultants for this office, then get their contracts
            const consultants = await db.consultant.getConsultantsByOffice(officeId);
            const consultantIds = consultants.map(c => c.id);

            if (consultantIds.length === 0) return [];

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
            consultantId?: string // Optional: if provided, only import for this consultant
        ): Promise<{ success: number; errors: Array<{ row: number; error: string }> }> => {
            const errors: Array<{ row: number; error: string }> = [];
            let successCount = 0;

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                try {
                    // First 4 columns are: Cliente, Poliza, Moneda, Asesor
                    if (row.length < 4) {
                        errors.push({ row: i + 1, error: 'Row does not have enough columns' });
                        continue;
                    }

                    const cliente = row[0]?.trim();
                    const poliza = row[1]?.trim();
                    const moneda = row[2]?.trim();
                    const asesor = row[3]?.trim();

                    if (!cliente || !asesor) {
                        errors.push({ row: i + 1, error: 'Missing Cliente or Asesor' });
                        continue;
                    }

                    let consultant: Consultant;

                    // If consultantId is provided (consultant importing), use it directly
                    if (consultantId) {
                        const foundConsultant = await db.consultant.getConsultantById(consultantId);
                        if (!foundConsultant) {
                            errors.push({ row: i + 1, error: 'Consultant not found' });
                            continue;
                        }
                        // Verify the asesor name matches (case-insensitive)
                        if (foundConsultant.name.toLowerCase() !== asesor.toLowerCase()) {
                            errors.push({ row: i + 1, error: `Asesor name "${asesor}" does not match your account. You can only import contracts for yourself.` });
                            continue;
                        }
                        consultant = foundConsultant;
                    } else {
                        // Find or create consultant by name (for office/promotory users)
                        consultant = await db.consultant.findOrCreateConsultantByName(asesor, officeId);
                    }

                    // Find or create client
                    const client = await db.client.findOrCreateClientByName(cliente);

                    // Check if contract with this poliza (contract_number) already exists
                    if (poliza) {
                        const { data: existing } = await supabase
                            .from('contract')
                            .select('id')
                            .eq('contract_number', poliza)
                            .maybeSingle();

                        if (existing) {
                            errors.push({ row: i + 1, error: `Contract with poliza "${poliza}" already exists` });
                            continue;
                        }
                    }

                    // Create contract
                    // contract_number stores the poliza ID (extracted "poliza" value)
                    await db.contract.createContract({
                        consultant_id: consultant.id,
                        client_id: client.id,
                        contract_number: poliza || null, // poliza value goes to contract_number
                        currency: moneda || null,
                        status: 'PENDING',
                    });

                    successCount++;
                } catch (error: any) {
                    errors.push({ row: i + 1, error: error.message || 'Unknown error' });
                }
            }

            return { success: successCount, errors };
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
    },
};

