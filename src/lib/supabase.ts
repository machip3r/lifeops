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
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    created_at?: string;
    updated_at?: string;
}

/** Office-scoped label; `section` selects which entity type it applies to. */
export type TagSection = 'consultant' | 'client';

export interface Tag {
    id: string;
    office_id: string;
    name: string;
    section: TagSection;
    created_at?: string;
    updated_at?: string;
}

export interface ConsultantTag {
    consultant_id: string;
    tag_id: string;
    created_at?: string;
}

export interface ConsultantWithTags extends Consultant {
    tags: Tag[];
}

export interface Client {
    id: string;
    office_id?: string | null;
    name: string;
    birth_date?: string | null;
    created_at?: string;
    updated_at?: string;
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
    consultant_id: string;
    client_id?: string | null;
    contract_number?: string | null; // This stores the poliza ID
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
    created_by?: string | null;
    updated_by?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface CollectionAuditLog {
    id: string;
    office_id: string;
    contract_id?: string | null;
    actor_user_id?: string | null;
    action_type: CollectionAuditActionType;
    source: CollectionPaymentSource;
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

// Legacy Policy interface for backward compatibility (will be removed)
export interface Policy {
    id?: string;
    request_type: 'EMIT' | 'CHANGE' | 'CORRECT';
    consultant_id: string;
    consultant_code?: string;
    consultant_name: string;
    contract_number?: string;
    contract_number_status?: string;
    capture_date?: string;
    days_in_process?: number;
    completion_date?: string;
    days_in_payment_process?: number;
    deadline_without_coverage?: string;
    who_processed?: string;
    drive_link?: string;
    client_full_name?: string;
    project_name?: string;
    insured_amount?: string;
    annual_premium?: string;
    weighting?: string;
    with_payment_method?: string;
    real_paid?: string;
    payment_method?: string;
    currency?: string;
    collection_channel?: string;
    payment_date?: string;
    payment_day?: number;
    payment_month?: number;
    payment_year?: number;
    policy_number?: string;
    change_type?: string;
    change_description?: string;
    bank?: string;
    token_clabe?: string;
    card_type?: string;
    collection_day?: string;
    folio_to_correct?: string;
    correction_description?: string;
    drive_updated?: string;
    status?: string;
    notes?: string;
    created_at?: string;
    updated_at?: string;
}

