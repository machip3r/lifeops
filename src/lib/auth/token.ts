/**
 * Server Auth helpers (JWT validation) — not Auth Admin.
 * Route auth (`requireOfficeContext`) uses this; do not create ad-hoc anon clients elsewhere.
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";

export async function getUserFromAccessToken(accessToken: string) {
  const authClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return authClient.auth.getUser(accessToken);
}
