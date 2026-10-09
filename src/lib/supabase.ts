import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';

const supabaseUrl = getSupabaseUrl();
const supabaseAnonKey = getSupabaseAnonKey();

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase public env missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

/** Browser / RLS-scoped client (anon key). Never put the service role here. */
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface Office {
    id: string;
    email: string;
    name: string;
    created_at?: string;
    updated_at?: string;
}

export interface Consultant {
    id: string; // Always has a value (temporary UUID or auth user ID)
    email: string | null; // Can be null initially
    name: string;
    consultant_code: string | null; // Can be null initially
    auth_user_id: string | null; // Links to auth user when consultant is invited
    office_id: string;
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING' | 'NOT_INVITED';
    created_at?: string;
    updated_at?: string;
}

export interface Client {
    id: string;
    office_id?: string | null;
    name: string;
    birth_date?: string | null;
    /** Mexican CURP when known — unique globally; preferred identity for future client login. */
    curp?: string | null;
    /** Mexican RFC when known — unique globally. */
    rfc?: string | null;
    created_at?: string;
    updated_at?: string;
}

/** How a contract entered LifeOps. */
export type ContractSource = 'import' | 'manual' | 'mixed';

export interface CommissionImport {
    id: string;
    office_id: string;
    uploaded_by?: string | null;
    file_name?: string | null;
    file_path?: string | null;
    file_type?: string | null;
    file_size?: number | null;
    issue_date: string;
    prior_payment_date?: string | null;
    status: 'pending' | 'preview' | 'imported' | 'failed';
    row_count?: number | null;
    contracts_created?: number | null;
    contracts_updated?: number | null;
    payments_marked?: number | null;
    error_message?: string | null;
    metadata?: Record<string, unknown> | null;
    created_at?: string;
    updated_at?: string;
}

export interface ContractAtRisk {
    contract_id: string;
    office_id: string;
    consultant_id: string;
    client_id?: string | null;
    contract_number?: string | null;
    client_name?: string | null;
    consultant_name?: string | null;
    collection_day?: number | null;
    due_date: string;
    days_overdue: number;
    collection_status?: string | null;
}

export interface ContractPendingPayment {
    contract_id: string;
    office_id: string;
    consultant_id: string;
    client_id?: string | null;
    contract_number?: string | null;
    client_name?: string | null;
    consultant_name?: string | null;
    collection_day?: number | null;
    due_date: string;
    days_until_due: number;
    is_overdue: boolean;
}

/** Cobranza estatus (separate from contract lifecycle `status`). */
export type CollectionStatus =
    | 'AMPARADO'
    | 'CORRIENTE'
    | 'FLEXIBLE'
    | 'FLEXIBLE_REVISAR'
    | 'MES'
    | 'PERIODO_GRACIA'
    | 'ATRASADO';

export type CollectionPaymentSource = 'manual' | 'import';

export type CollectionAuditActionType =
    | 'status_change'
    | 'payment_upsert'
    | 'payment_clear'
    | 'collection_day_change'
    | 'payment_channel_change'
    | 'project_name_change'
    | 'import_sync';

export interface Contract {
    id: string;
    /** Denormalized from consultant for tenancy / unique poliza per office. */
    office_id: string;
    consultant_id: string;
    client_id?: string | null;
    contract_number?: string | null; // This stores the poliza ID
    source?: ContractSource;
    issue_date?: string | null;
    capture_date?: string | null;
    project_name?: string | null;
    insured_amount?: string | null;
    annual_premium?: string | null;
    payment_method?: string | null;
    currency?: string | null;
    exchange_rate?: number | null; // Tipo de cambio. NULL means MXN (no conversion)
    payment_channel?: string | null;
    folder_key?: string | null;
    status: string; // Default 'PENDING' — lifecycle, not cobranza
    collection_status?: CollectionStatus | null;
    collection_day?: number | null;
    metadata?: { [key: string]: any };
    created_at?: string;
    updated_at?: string;
}

export interface ContractCollectionPayment {
    id: string;
    contract_id: string;
    year: number;
    month: number;
    scheduled_day?: number | null;
    paid_at?: string | null;
    amount?: number | null;
    notes?: string | null;
    source: CollectionPaymentSource;
    commission_import_id?: string | null;
    created_by?: string | null;
    updated_by?: string | null;
    created_at?: string;
    updated_at?: string;
}

export type AuditSource = 'ui' | 'import' | 'api' | 'system';
/** Stored in audit_log; UI copy uses "promotoría" / "promotora", never this slug. */
export type AuditActorRole = 'office' | 'consultant' | 'system';

/** Append-only office activity (replaces collection_audit_log + contract_reassignment_log). */
export interface AuditLog {
    id: string;
    office_id: string;
    actor_user_id?: string | null;
    actor_role?: AuditActorRole | null;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    source: AuditSource;
    old_values?: Record<string, unknown> | null;
    new_values?: Record<string, unknown> | null;
    created_at?: string;
}

export interface ContractChangeRequest {
    id: string;
    contract_id: string;
    request_type: 'CHANGE' | 'CORRECT';
    folio_number?: string | null;
    details?: string | null;
    notes?: string | null;
    folder_key?: string | null;
    status: string; // Default 'PENDING'
    metadata?: { [key: string]: any };
    created_at?: string;
    updated_at?: string;
}

export interface ContractDetail {
    id: string;
    contract_id: string;
    commission_import_id?: string | null;
    issue_date?: string | null; // FECHA EMISION
    payment_date?: string | null; // FECHA PAGO
    premium_payment?: number | null; // PRIMA PAGO
    payment_method?: string | null; // FORMA DE PAGO
    commission_honoraries?: number | null; // COMISION/HONORARIOS
    commission_percentage?: number | null; // % COMISION
    collection_premium?: number | null; // PRIMA COBRO
    seniority?: string | null; // ANTIGÜEDAD
    target_premium?: number | null; // PRIMA META
    movement?: string | null; // MOVIMIENTO
    commission_premium?: number | null; // PRIMA COMISION
    created_at?: string;
    updated_at?: string;
}

export interface File {
    id: string;
    office_id: string;
    consultant_id: string;
    contract_id: string;
    change_request_id?: string | null;
    /** When set, this file is evidence for a cobranza month payment. */
    collection_payment_id?: string | null;
    display_name: string;
    file_name: string;
    file_path: string;
    file_type?: string | null;
    file_size?: number | null;
    file_url?: string | null;
    status: string; // Default 'ACTIVE'
    metadata?: { [key: string]: any };
    created_at?: string;
    updated_at?: string;
}

