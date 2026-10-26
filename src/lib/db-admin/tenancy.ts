/** Office / consultant tenancy lookups for the HTTP auth boundary. */
import "server-only";

import type { Office } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function getAdminOfficeById(id: string): Promise<Office | null> {
  const { data, error } = await supabaseAdmin
    .from("office")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getConsultantTenancyByAuthUserIdAdmin(
  authUserId: string,
): Promise<{ id: string; office_id: string } | null> {
  const { data, error } = await supabaseAdmin
    .from("consultant")
    .select("id, office_id")
    .or(`id.eq.${authUserId},auth_user_id.eq.${authUserId}`)
    .maybeSingle();
  if (error) throw error;
  if (!data?.office_id) return null;
  return { id: data.id as string, office_id: data.office_id as string };
}
