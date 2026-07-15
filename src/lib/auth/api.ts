import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/supabase/env";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type OfficeContext = {
  user: { id: string; email?: string };
  role: "promotory" | "consultant";
  officeId: string;
  consultantId?: string;
};

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

/** Validate JWT from Authorization: Bearer … then load office tenancy. */
export async function requireOfficeContext(
  request: NextRequest,
): Promise<{ ok: true; ctx: OfficeContext } | { ok: false; status: number; error: string }> {
  const token = getBearerToken(request);
  if (!token) {
    return { ok: false, status: 401, error: "No autenticado." };
  }

  const authClient = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return { ok: false, status: 401, error: "No autenticado." };
  }

  const { data: office } = await supabaseAdmin
    .from("office")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (office) {
    return {
      ok: true,
      ctx: {
        user: { id: user.id, email: user.email },
        role: "promotory",
        officeId: office.id,
      },
    };
  }

  const { data: consultant } = await supabaseAdmin
    .from("consultant")
    .select("id, office_id")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();

  if (consultant?.office_id) {
    return {
      ok: true,
      ctx: {
        user: { id: user.id, email: user.email },
        role: "consultant",
        officeId: consultant.office_id,
        consultantId: consultant.id,
      },
    };
  }

  return { ok: false, status: 403, error: "Perfil no encontrado." };
}

/** Ensure body officeId matches the caller's office (promotory or consultant). */
export function assertOfficeAccess(
  ctx: OfficeContext,
  officeId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (ctx.officeId !== officeId) {
    return { ok: false, status: 403, error: "No autorizado para esta oficina." };
  }
  return { ok: true };
}

export function assertPromotory(
  ctx: OfficeContext,
): { ok: true } | { ok: false; status: number; error: string } {
  if (ctx.role !== "promotory") {
    return { ok: false, status: 403, error: "Solo la oficina puede realizar esta acción." };
  }
  return { ok: true };
}
