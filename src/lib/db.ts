import { supabase } from './supabase';
import type { Office, Consultant, Client, Contract, ContractChangeRequest, File, ContractDetail } from './supabase';
import {
    syncPaymentsFromImportedDetails,
    writeImportSyncAudit,
} from '@/lib/collections/service';

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
            let detailsInsertedTotal = 0;
            let paymentsUpsertedTotal = 0;
            const {
                data: { user: importActor },
            } = await supabase.auth.getUser();

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

            // Pre-fetch consultants in batch (if not using consultantId); create missing for this office
            const consultantCache = new Map<string, Consultant>();
            const ensureConsultantErrorByCode = new Map<string, string>();
            if (!consultantId) {
                const uniqueConsultantCodes = [...new Set(Array.from(contractGroups.values()).map(g => g.consultantCode))];
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
                }
            } else {
                const consultant = await db.consultant.getConsultantById(consultantId);
                if (consultant) {
                    consultantCache.set(consultant.consultant_code?.toLowerCase() || '', consultant);
                }
            }

            // Pre-fetch existing contracts in batch
            const contractNumbersToCheck = Array.from(contractGroups.values())
                .map(g => g.contractNumber)
                .filter((p): p is string => !!p);

            const existingContractsMap = new Map<string, Contract>();
            if (contractNumbersToCheck.length > 0) {
                const { data: existingContracts } = await supabase
                    .from('contract')
                    .select('*')
                    .in('contract_number', contractNumbersToCheck);

                if (existingContracts) {
                    existingContracts.forEach((c: Contract) => {
                        if (c.contract_number) {
                            existingContractsMap.set(c.contract_number, c);
                        }
                    });
                }
            }

            // Pre-fetch clients in batch (single query for all clients)
            const uniqueClientNames = [...new Set(Array.from(contractGroups.values()).map(g => g.clientName))];
            const clientCache = await db.client.findOrCreateClientsByName(uniqueClientNames, officeId);

            // Helper functions (defined here so they can be used in the loop)
            // Parse exchange rate - tipo cambio
            const parseExchangeRate = (value: string | null): number | null => {
                if (!value || !value.trim() || value.trim() === 'NULL' || value.trim() === '') return null;
                // Remove commas, spaces, and other formatting
                const cleaned = value.trim().replace(/,/g, '').replace(/\s/g, '');
                const parsed = parseFloat(cleaned);
                return isNaN(parsed) ? null : parsed;
            };

            // Process each contract group
            for (const [contractKey, group] of contractGroups.entries()) {
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
                            // Create new contract
                            contract = await db.contract.createContract({
                                consultant_id: consultant.id,
                                client_id: client.id,
                                contract_number: group.contractNumber,
                                currency: group.currency || null,
                                exchange_rate: parseExchangeRate(group.exchangeRate),
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

                    // Parse dates helper - converts DD/MM/YYYY to YYYY-MM-DD
                    // This format is safe for PostgreSQL DATE type and avoids timezone issues
                    const parseDate = (dateStr: string | null): string | null => {
                        if (!dateStr || !dateStr.trim()) return null;
                        const parts = dateStr.trim().split('/');
                        if (parts.length === 3) {
                            const day = parts[0].padStart(2, '0');
                            const month = parts[1].padStart(2, '0');
                            const year = parts[2];
                            // Return in YYYY-MM-DD format (ISO date format, no time component)
                            // This avoids timezone conversion issues when stored as DATE in PostgreSQL
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

                    // Normalize payment method (FORMA DE PAGO) to catalog values
                    const normalizePaymentMethod = (value: string | null): string | null => {
                        if (!value) return null;
                        // Remove anything in parentheses so values like "Semestral (2)" still normalize correctly
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

                        // Seed cobranza month marks from imported payment dates (never overwrite manual)
                        try {
                            const upserted = await syncPaymentsFromImportedDetails(supabase, {
                                officeId,
                                actorUserId: importActor?.id ?? null,
                                contractId: contract.id,
                                details: detailRecordsToInsert.map((d) => ({
                                    payment_date: d.payment_date ?? null,
                                    collection_premium: d.collection_premium ?? null,
                                })),
                            });
                            paymentsUpsertedTotal += upserted;
                        } catch (syncErr) {
                            console.error('Cobranza import sync failed', syncErr);
                            warnings.push({
                                row: group.rows[0]?.rowIndex || 0,
                                message: 'Detalles importados, pero no se pudo sincronizar cobranza para este contrato.',
                            });
                        }
                    } else if (skippedDetails > 0 && !isNewContract) {
                        warnings.push({ row: group.rows[0]?.rowIndex || 0, message: `All ${skippedDetails} detail(s) for contract "${group.contractNumber || 'N/A'}" were duplicates and skipped.` });
                    }

                    successCount++;
                } catch (error: any) {
                    errors.push({ row: group.rows[0]?.rowIndex || 0, error: error.message || 'Unknown error creating contract' });
                }
            }

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
        getAllClients: async (officeId?: string): Promise<Client[]> => {
            let query = supabase.from('client').select('*').order('created_at', { ascending: false });
            if (officeId) {
                query = query.eq('office_id', officeId);
            }
            const { data, error } = await query;
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
            const uniqueNames = [...new Set(names.map(n => n.trim()))];

            if (uniqueNames.length === 0) return clientMap;

            let query = supabase.from('client').select('*');
            const orConditions = uniqueNames.map(name => `name.ilike.${name}`).join(',');
            query = query.or(orConditions);
            if (officeId) query = query.eq('office_id', officeId);
            const { data: existingClients, error: searchError } = await query;

            if (searchError && searchError.code !== 'PGRST116') {
                throw searchError;
            }

            const existingMap = new Map<string, Client>();
            if (existingClients) {
                existingClients.forEach((client: Client) => {
                    const key = client.name.toLowerCase();
                    existingMap.set(key, client);
                    clientMap.set(key, client);
                });
            }

            const namesToCreate = uniqueNames.filter(name => {
                const key = name.toLowerCase();
                return !existingMap.has(key);
            });

            if (namesToCreate.length > 0) {
                const clientsToCreate = namesToCreate.map(name => ({
                    name,
                    birth_date: null,
                    office_id: officeId ?? null,
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

