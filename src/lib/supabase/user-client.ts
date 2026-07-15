import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

/** RLS-scoped Supabase client bound to a user JWT (Server Actions / route handlers). */
export function createUserClient(accessToken: string): SupabaseClient {
  const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });

  // Ensure auth helpers see the same JWT used for PostgREST RLS.
  void client.auth.getUser(accessToken);

  return client;
}
