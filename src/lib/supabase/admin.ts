import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";

const url = getSupabaseUrl();
const serviceRoleKey = getSupabaseServiceRoleKey();

if (!url || !serviceRoleKey) {
  console.warn(
    "Supabase service role env missing. Set SUPABASE_SERVICE_ROLE_KEY on the server only.",
  );
}

/**
 * Privileged Supabase client — import only from Server Actions / Route Handlers / server components.
 * Never import this from client components.
 */
export const supabaseAdmin = createClient(url, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
