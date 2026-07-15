/**
 * Shared Supabase env helpers.
 * Browser: only NEXT_PUBLIC_URL + NEXT_PUBLIC_ANON_KEY.
 * Server: SUPABASE_SERVICE_ROLE_KEY only (never NEXT_PUBLIC_*).
 */

export function getSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || "";
}

export function getSupabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
}

/** Server-only. Do not call from client code. */
export function getSupabaseServiceRoleKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}
