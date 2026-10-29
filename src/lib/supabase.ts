import { createClient } from '@supabase/supabase-js';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';
import type { PortfolioStatus } from '@/lib/collections/status';
import type { PolicyStatus } from '@/lib/contracts/policy-status';

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
    /** Null until onboarding step 1 (signup only asks correo + contraseña). */
    name: string | null;
    agency_code?: string | null;
    state_code?: string | null;
    consultant_count_range?: string | null;
    active_policy_range?: string | null;
    primary_goal?: string | null;
    /** Last onboarding step saved (0–3). */
    onboarding_step?: number;
    onboarding_version?: number | null;
    /** Null = must finish onboarding before using the dashboard. */
    onboarding_completed_at?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface OfficeContact {
    office_id: string;
    kind: 'REGISTRANT' | 'OWNER';
    full_name: string;
    job_role: string | null;
    phone: string;
}

/** Catalog row (aseguradora, ramo or estado). */
export interface CatalogOption {
    code: string;
    name: string;
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
    /** Contact phone / WhatsApp, 10 digits */
    phone?: string | null;
    /** Contact email, lowercase */
    email?: string | null;
    marital_status?: string | null;
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
    /** Póliza status from the insurer (default IN_FORCE); only IN_FORCE is in cobranza */
    status: PolicyStatus;
    /** Insurer reported it en vigor on this date (Mina de Oro cut-off / rehabilitation): receipts due up to it count as paid */
    in_force_as_of?: string | null;
    collection_status?: CollectionStatus | null;
    collection_day?: number | null;
    /** Persona asegurada principal (may differ from the contratante) */
    insured_name?: string | null;
    /** Ramo: LIFE (vida) / HEALTH (gastos médicos) */
    line_code?: string | null;
    plan_classification?: string | null;
    /** Fin de vigencia */
    end_date?: string | null;
    annual_premium_mxn?: number | null;
    insured_amount_mxn?: number | null;
    deductible_mxn?: number | null;
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

/** One `audit_log` row as read by detail pages. */
export interface AuditLogEntry {
    id: string;
    action: string;
    actor_role: AuditActorRole | null;
    source: AuditSource | null;
    old_values: Record<string, unknown> | null;
    new_values: Record<string, unknown> | null;
    created_at: string;
}
/** Stored in audit_log; UI copy uses "promotoría" / "promotora", never this slug. */
export type AuditActorRole = 'office' | 'consultant' | 'system';

/** Cartera status by next due (same rule as Cobranza). */
export type CarteraStatusCounts = {
    current: number;
    due_soon: number;
    overdue: number;
    at_risk: number;
    /** No known payment: next due can't be computed */
    no_payment: number;
};

/** `get_collection_overview` (Vista general). Counts only — amounts aren't reliable yet. */
export interface CollectionOverview {
    today: string;
    risk_days: number;
    due_soon_days: number;
    active_contracts: number;
    status: CarteraStatusCounts;
    due_today: number;
    due_next_7_days: number;
    missing_payment_method: number;
    aging: {
        d1_10: number;
        d11_20: number;
        d21_30: number;
        d31_60: number;
        d61_90: number;
        d90_plus: number;
    };
    payments_month_to_date: number;
    payments_prev_month_to_date: number;
    monthly_payments: Array<{ year: number; month: number; count: number }>;
    by_consultant: Array<CarteraStatusCounts & { consultant_id: string; name: string; total: number }>;
    /** Office view only (null for an asesor) */
    consultants_not_invited: number | null;
    consultants_pending_invite: number | null;
}

/** One póliza row of `list_contract_portfolio` (cartera status from the receipt calendar). */
export interface ContractPortfolioRow {
    id: string;
    contract_number: string | null;
    client_id: string | null;
    client_name: string | null;
    consultant_id: string;
    consultant_name: string | null;
    currency: string | null;
    payment_method: string | null;
    issue_date: string | null;
    status: PolicyStatus;
    next_due: string | null;
    /** Positive = days late; null without next due */
    days_past_due: number | null;
    cartera_status: PortfolioStatus;
}

export interface ContractPortfolio {
    /** Rows matching search + status filter */
    total: number;
    /** Per cartera status counts after search + póliza status filter (chips) */
    counts: Record<PortfolioStatus | 'all', number>;
    /** Per póliza status counts after search (chips) */
    policy_counts: Record<PolicyStatus | 'all', number>;
    /** Pólizas en vigor in scope (counters) */
    summary: {
        active: number;
        clients: number;
        consultants: number;
        current: number;
        due_soon: number;
        overdue: number;
        at_risk: number;
        no_payment: number;
        missing_payment_method: number;
        due_next_30_days: number;
        payments_last_30_days: number;
    };
    rows: ContractPortfolioRow[];
}

/** One active póliza on the Cobranza board (`list_collection_board`). */
export interface CollectionBoardRow {
    contract_id: string;
    contract_number: string | null;
    client_id: string | null;
    client_name: string | null;
    client_phone: string | null;
    consultant_id: string;
    consultant_name: string | null;
    consultant_code: string | null;
    payment_method: string | null;
    currency: string | null;
    issue_date: string | null;
    collection_day: number | null;
    next_due: string | null;
    /** Positive = days late */
    days_past_due: number | null;
    cartera_status: Exclude<PortfolioStatus, 'inactive'>;
    last_paid_at: string | null;
    /** Primas of the latest FECHA PAGO (suggested amount); null without commission lines */
    amount: number | null;
}

export interface CollectionBoard {
    today: string;
    payments_month_to_date: number;
    rows: CollectionBoardRow[];
}

/** Most critical cartera status among a client's active pólizas (`none` = no active póliza). */
export type ClientCarteraStatus = Exclude<PortfolioStatus, 'inactive'> | 'none';
export type ClientPortfolioFilter = 'with_active' | 'late' | 'at_risk' | 'no_active';

/** One row of `list_client_portfolio`. */
export interface ClientPortfolioRow {
    id: string;
    name: string;
    curp: string | null;
    rfc: string | null;
    phone: string | null;
    email: string | null;
    birth_date: string | null;
    created_at: string | null;
    active_contracts: number;
    total_contracts: number;
    next_due: string | null;
    consultant_names: string | null;
    cartera_status: ClientCarteraStatus;
    /** Days late of the most critical póliza (overdue / at risk only) */
    days_past_due: number | null;
}

export interface ClientPortfolio {
    total: number;
    counts: Record<ClientPortfolioFilter | 'all', number>;
    summary: {
        clients: number;
        with_active: number;
        late: number;
        at_risk: number;
        birthdays_this_month: number;
        missing_contact: number;
    };
    rows: ClientPortfolioRow[];
}

/** One row of `list_consultant_portfolio`. */
export interface ConsultantPortfolioRow extends CarteraStatusCounts {
    id: string;
    name: string;
    email: string | null;
    consultant_code: string | null;
    status: Consultant['status'];
    created_at: string | null;
    active_contracts: number;
    clients: number;
    payments_last_30_days: number;
    /** (al corriente + por vencer) / pólizas with next due; null without data */
    healthy_share: number | null;
}

export interface ConsultantPortfolio {
    total: number;
    counts: Record<Consultant['status'] | 'all', number>;
    summary: {
        consultants: number;
        active: number;
        pending_invites: number;
        active_contracts: number;
        healthy_share: number | null;
        with_at_risk: number;
        at_risk_names: string[];
    };
    rows: ConsultantPortfolioRow[];
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
    receipt_number?: string | null; // RECIBO — unique per contract when set
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

