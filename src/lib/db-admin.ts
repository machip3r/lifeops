import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Consultant, Office } from "@/lib/supabase";

/** Auth Admin has no get-by-email; paginate until the address is found. */
async function findAuthUserIdByEmail(targetEmail: string): Promise<string | null> {
  const wanted = targetEmail.toLowerCase();
  const perPage = 1000;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("findAuthUserIdByEmail listUsers:", error);
      break;
    }
    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email?.toLowerCase() === wanted) return user.id;
    }
    if (users.length < perPage) hasMore = false;
    else page += 1;
  }
  return null;
}

async function listAuthUserIdsByEmails(
  emails: string[],
): Promise<Map<string, string>> {
  const emailSet = new Set(emails.map((e) => e.toLowerCase()).filter(Boolean));
  const result = new Map<string, string>();
  if (emailSet.size === 0) return result;

  const perPage = 1000;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.warn("listAuthUserIdsByEmails listUsers:", error);
      break;
    }
    const users = data?.users ?? [];
    for (const user of users) {
      if (user.email && emailSet.has(user.email.toLowerCase())) {
        result.set(user.email.toLowerCase(), user.id);
      }
    }
    if (users.length < perPage) hasMore = false;
    else page += 1;
  }
  return result;
}

export async function getAdminOfficeById(id: string): Promise<Office | null> {
  const { data, error } = await supabaseAdmin
    .from("office")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateAuthUserEmail(
  authUserId: string,
  email: string | null | undefined,
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    email: email || undefined,
  });
  if (error) {
    throw new Error(
      `Error al actualizar el correo en el sistema de autenticación: ${error.message}`,
    );
  }
}

export type CreateConsultantInput = {
  consultantCode: string;
  name: string;
  email: string;
  password: string;
};

export async function createConsultantWithAuth(
  officeId: string,
  input: CreateConsultantInput,
): Promise<{ consultant: Consultant; created: boolean }> {
  const emailLower = input.email.trim().toLowerCase();
  let authUserId: string | null = null;

  const existingByEmail = await listAuthUserIdsByEmails([emailLower]);
  authUserId = existingByEmail.get(emailLower) ?? null;

  if (!authUserId) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: emailLower,
      password: input.password,
      email_confirm: true,
    });

    if (authError) {
      authUserId = await findAuthUserIdByEmail(emailLower);
      if (!authUserId) {
        throw new Error(authError.message || "No se pudo crear el usuario del asesor");
      }
    } else {
      authUserId = authData?.user?.id ?? null;
    }
  }

  if (!authUserId) {
    throw new Error("No se pudo obtener el ID de usuario del asesor");
  }

  const { data: existingById } = await supabaseAdmin
    .from("consultant")
    .select("*")
    .eq("id", authUserId)
    .maybeSingle();

  if (existingById) {
    if (existingById.office_id === officeId) {
      return { consultant: existingById as Consultant, created: false };
    }
    throw new Error(
      `El correo ${input.email} ya está registrado como asesor. Use otro correo para ${input.consultantCode}.`,
    );
  }

  const { data: anyConsultant } = await supabaseAdmin
    .from("consultant")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (anyConsultant) {
    throw new Error(
      `El correo ${input.email} ya está registrado como asesor. Use otro correo para ${input.consultantCode}.`,
    );
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("consultant")
    .insert({
      id: authUserId,
      office_id: officeId,
      name: input.name.trim() || input.consultantCode.trim(),
      email: emailLower,
      consultant_code: input.consultantCode.trim(),
      auth_user_id: authUserId,
      status: "PENDING",
    })
    .select()
    .single();

  if (insErr) throw new Error(insErr.message);
  return { consultant: inserted as Consultant, created: true };
}

/**
 * For HTML import: if no consultant with this code exists for the office,
 * create auth user + consultant row with a default email/password.
 */
export async function ensureConsultantForImport(
  code: string,
  officeId: string,
): Promise<{ consultant: Consultant | null; created: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { consultant: null, created: false, error: "Código de asesor vacío" };
  }

  const { data: existing } = await supabaseAdmin
    .from("consultant")
    .select("*")
    .eq("consultant_code", trimmed)
    .eq("office_id", officeId)
    .maybeSingle();

  if (existing) {
    return { consultant: existing as Consultant, created: false };
  }

  const { data: globalRow } = await supabaseAdmin
    .from("consultant")
    .select("*")
    .eq("consultant_code", trimmed)
    .maybeSingle();

  if (globalRow) {
    if (globalRow.office_id === officeId) {
      return { consultant: globalRow as Consultant, created: false };
    }
    return {
      consultant: null,
      created: false,
      error: `El código "${trimmed}" ya está asignado a otra oficina.`,
    };
  }

  const defaultEmail = `braulinusmac+${trimmed}@gmail.com`;
  const defaultPassword = "Hola123!!";

  try {
    const result = await createConsultantWithAuth(officeId, {
      consultantCode: trimmed,
      name: trimmed,
      email: defaultEmail,
      password: defaultPassword,
    });
    return { consultant: result.consultant, created: result.created };
  } catch (e) {
    return {
      consultant: null,
      created: false,
      error: e instanceof Error ? e.message : "No se pudo crear el asesor",
    };
  }
}

export async function findMissingConsultantCodes(
  officeId: string,
  codes: string[],
): Promise<string[]> {
  const unique = [...new Set(codes.map((c) => c.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const { data: existingConsultants } = await supabaseAdmin
    .from("consultant")
    .select("consultant_code")
    .eq("office_id", officeId)
    .in("consultant_code", unique);

  const existingCodes = new Set(
    (existingConsultants || [])
      .map((c) => c.consultant_code?.toLowerCase())
      .filter((code): code is string => !!code),
  );

  return unique.filter((code) => !existingCodes.has(code.toLowerCase()));
}

export async function findContractsByNumbers(
  contractNumbers: string[],
): Promise<Array<{ id: string; contract_number: string }>> {
  if (contractNumbers.length === 0) return [];
  const { data, error } = await supabaseAdmin
    .from("contract")
    .select("id, contract_number")
    .in("contract_number", contractNumbers);

  if (error) throw error;
  return (data || []) as Array<{ id: string; contract_number: string }>;
}
