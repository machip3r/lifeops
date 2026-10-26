import type { SupabaseClient } from '@supabase/supabase-js';

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

/** `token` table access (RLS-scoped client: browser session or user JWT). */
export function createTokenDb(supabase: SupabaseClient) {
    const tokenDb = {
        getTokenByValue: async (tokenValue: string): Promise<Token | null> => {
            const { data, error } = await supabase
                .from('token')
                .select('*')
                .eq('token', tokenValue)
                .maybeSingle();

            if (error) throw error;
            return data;
        },
    };

    return tokenDb;
}
