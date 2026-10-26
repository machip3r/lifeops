import type { SupabaseClient } from '@supabase/supabase-js';
import type { CatalogOption, Office, OfficeContact } from '@/lib/supabase';

export type OfficeOnboarding = Office & {
    contacts: OfficeContact[];
    insurers: Array<{ insurer_code: string; other_name: string | null }>;
    lineCodes: string[];
};

export type OnboardingCatalogs = {
    states: CatalogOption[];
    insurers: CatalogOption[];
    linesOfBusiness: CatalogOption[];
};

/** Onboarding answers + catalogs (RLS: a promotoría reads and writes only its own rows). */
export function createOfficeOnboardingDb(supabase: SupabaseClient) {
    const officeOnboardingDb = {
        /** Office row with contacts, aseguradoras and ramos in one request. */
        get: async (officeId: string): Promise<OfficeOnboarding | null> => {
            const { data, error } = await supabase
                .from('office')
                .select(
                    '*, office_contact(office_id, kind, full_name, job_role, phone), office_insurer(insurer_code, other_name), office_line_of_business(line_code)',
                )
                .eq('id', officeId)
                .maybeSingle();
            if (error) throw error;
            if (!data) return null;
            const {
                office_contact: contacts,
                office_insurer: insurers,
                office_line_of_business: lines,
                ...office
            } = data as Office & {
                office_contact: OfficeContact[] | null;
                office_insurer: Array<{ insurer_code: string; other_name: string | null }> | null;
                office_line_of_business: Array<{ line_code: string }> | null;
            };
            return {
                ...office,
                contacts: contacts ?? [],
                insurers: insurers ?? [],
                lineCodes: (lines ?? []).map((line) => line.line_code),
            };
        },

        listCatalogs: async (): Promise<OnboardingCatalogs> => {
            const [states, insurers, lines] = await Promise.all([
                supabase.from('mx_state').select('code, name').order('name'),
                supabase.from('insurer').select('code, name').order('sort_order'),
                supabase.from('line_of_business').select('code, name').order('sort_order'),
            ]);
            if (states.error) throw states.error;
            if (insurers.error) throw insurers.error;
            if (lines.error) throw lines.error;
            return {
                states: (states.data as CatalogOption[]) ?? [],
                insurers: (insurers.data as CatalogOption[]) ?? [],
                linesOfBusiness: (lines.data as CatalogOption[]) ?? [],
            };
        },

        saveProfile: async (input: {
            officeName: string;
            stateCode: string;
            agencyCode: string | null;
        }): Promise<void> => {
            const { error } = await supabase.rpc('save_office_onboarding_profile', {
                p_name: input.officeName,
                p_state_code: input.stateCode,
                p_agency_code: input.agencyCode,
            });
            if (error) throw error;
        },

        saveContacts: async (input: {
            fullName: string;
            jobRole: string;
            phone: string;
            ownerName: string | null;
            ownerPhone: string | null;
        }): Promise<void> => {
            const { error } = await supabase.rpc('save_office_onboarding_contacts', {
                p_full_name: input.fullName,
                p_job_role: input.jobRole,
                p_phone: input.phone,
                p_owner_name: input.ownerName,
                p_owner_phone: input.ownerPhone,
            });
            if (error) throw error;
        },

        /** Saves step 3 and marks onboarding complete (first time only). Returns `onboarding_completed_at`. */
        saveOperation: async (input: {
            insurerCodes: string[];
            otherInsurer: string | null;
            lineCodes: string[];
            consultantCountRange: string;
            activePolicyRange: string;
            primaryGoal: string | null;
            version: number;
        }): Promise<string> => {
            const { data, error } = await supabase.rpc('save_office_onboarding_operation', {
                p_insurer_codes: input.insurerCodes,
                p_other_insurer: input.otherInsurer,
                p_line_codes: input.lineCodes,
                p_consultant_count_range: input.consultantCountRange,
                p_active_policy_range: input.activePolicyRange,
                p_primary_goal: input.primaryGoal,
                p_version: input.version,
            });
            if (error) throw error;
            return data as string;
        },
    };

    return officeOnboardingDb;
}
