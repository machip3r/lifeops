import { NextRequest } from "next/server";
import { getUserFromAccessToken } from "@/lib/auth/token";
import {
  getAdminOfficeById,
  getConsultantTenancyByAuthUserIdAdmin,
} from "@/lib/db-admin";

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

  const {
    data: { user },
    error,
  } = await getUserFromAccessToken(token);

  if (error || !user) {
    return { ok: false, status: 401, error: "No autenticado." };
  }

  const office = await getAdminOfficeById(user.id);
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

  const consultant = await getConsultantTenancyByAuthUserIdAdmin(user.id);
  if (consultant) {
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

/** Validate JWT and load office tenancy (promotory or consultant). */
export const requireUserContext = requireOfficeContext;

/** Ensure body officeId matches the caller's office (promotory or consultant). */
export function assertOfficeAccess(
  ctx: OfficeContext,
  officeId: string,
): { ok: true } | { ok: false; status: number; error: string } {
  if (ctx.officeId !== officeId) {
    return { ok: false, status: 403, error: "No autorizado para esta promotoría." };
  }
  return { ok: true };
}

export function assertPromotory(
  ctx: OfficeContext,
): { ok: true } | { ok: false; status: number; error: string } {
  if (ctx.role !== "promotory") {
    return { ok: false, status: 403, error: "Solo la promotoría puede realizar esta acción." };
  }
  return { ok: true };
}
