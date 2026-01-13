import { createClient } from '@supabase/supabase-js';

// Supabase configuration
// Get these values from your Supabase project settings: https://app.supabase.com
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
// Service role key should NOT be public - only use server-side
const supabaseServiceRoleKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
    console.warn('Supabase environment variables are not set. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file');
}

// Create a single supabase client for interacting with your database
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Database types
export interface Office {
    id: string;
    email: string;
    name: string;
    created_at?: string;
    updated_at?: string;
}

export interface Consultant {
    id: string | null; // Can be null if consultant hasn't been invited yet
    email: string | null; // Can be null initially
    name: string;
    consultant_code: string | null; // Can be null initially
    office_id: string;
    status: 'ACTIVE' | 'INACTIVE' | 'PENDING';
    created_at?: string;
    updated_at?: string;
}

export interface Client {
    id: string;
    name: string;
    birth_date?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface Contract {
    id: string;
    consultant_id: string;
    client_id?: string | null;
    folio_number?: string | null;
    contract_number?: string | null; // This stores the poliza ID
    capture_date?: string | null;
    project_name?: string | null;
    insured_amount?: string | null;
    annual_premium?: string | null;
    payment_method?: string | null;
    currency?: string | null;
    payment_channel?: string | null;
    folder_key?: string | null;
    status: string; // Default 'PENDING'
    metadata?: { [key: string]: any };
    created_at?: string;
    updated_at?: string;
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

export interface File {
    id: string;
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

// Legacy interface for backward compatibility (will be removed)
export interface PolicySubmission {
    id?: string;
    consultant_name?: string;
    consultant_email?: string;
    request_type: 'emit_policy' | 'change_policy' | 'correct_folio';
    policy_number?: string;
    folio_number?: string;
    description?: string;
    file_url?: string;
    file_name?: string;
    status?: 'pending' | 'in_progress' | 'completed' | 'rejected';
    created_at?: string;
    updated_at?: string;
}
