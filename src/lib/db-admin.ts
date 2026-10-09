/**
 * Privileged persistence adapter (service role) — server only.
 *
 * Hexagonal mapping for LifeOps:
 * - Route handlers / Server Actions = input adapters (HTTP / UI)
 * - This module (+ `src/lib/db.ts` for RLS-scoped reads/writes) = output adapter
 * - Keep Supabase/SQL here so a future store swap touches persistence, not routes
 *
 * Prefer:
 * - `db` (`src/lib/db.ts`) when the caller has a user JWT and RLS is enough
 * - `db-admin` (this file) for cross-tenant / bypass-RLS table work
 * - `src/lib/auth/admin.ts` for Auth Admin; `src/lib/storage/admin.ts` for Storage
 * - This module may orchestrate Auth/Storage helpers for multi-step flows
 */
import "server-only";

import {
  createAuthUser,
  deleteAuthUser,
  findAuthUserIdByEmail,
  listAuthUserIdsByEmails,
  updateAuthUserEmail,
  updateAuthUserPassword,
} from "@/lib/auth/admin";
import { chunkArray, IMPORT_BATCH_SIZE } from "@/lib/extractor/batch";
import { writeAuditLog } from "@/lib/audit/write";
import { removeDocumentObjects } from "@/lib/storage/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { Consultant, Office } from "@/lib/supabase";
import { LIMITS } from "@/lib/validation/schemas";

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "not_found" | "conflict" | "invalid" | "error"; error: string };

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

export type CreateConsultantInput = {
  consultantCode: string;
  name: string;
  email: string;
  password: string;
  /** Defaults to PENDING (invite in progress). Auto-import uses NOT_INVITED. */
  status?: 'PENDING' | 'NOT_INVITED';
};

export type ConsultantEmailClaim = {
  email: string;
  /** Same-office code that may already own this correo (retry of a create). */
  consultantCode?: string;
  /** Existing asesor that may keep or take this correo. */
  consultantId?: string;
};

function consultantCodeTakenMessage(
  code: string,
  status: string | null | undefined,
): string {
  const clave = code.trim();
  if (status === "INACTIVE") {
    return `La clave ${clave} pertenece a un asesor desactivado. Actívalo desde Asesores o usa otra clave.`;
  }
  return `La clave ${clave} ya está registrada. Usa otra.`;
}

function isConsultantCodeUniqueViolation(error: {
  message?: string;
  code?: string;
} | null): boolean {
  const message = error?.message || "";
  return (
    message.includes("consultant_code_per_office_unique") ||
    (error?.code === "23505" && message.includes("consultant_code"))
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function claimOwnsRow(
  claim: ConsultantEmailClaim,
  row: { id: string; office_id: string; consultant_code: string | null },
  officeId: string,
): boolean {
  if (claim.consultantId && row.id === claim.consultantId) return true;
  const code = claim.consultantCode?.trim().toLowerCase();
  if (!code || row.office_id !== officeId) return false;
  return (row.consultant_code || "").trim().toLowerCase() === code;
}

/**
 * Reject correos that repeat in the request, match the promotoría, or already
 * belong to another asesor or Auth user. Allowed claims may keep their own correo.
 */
export async function findConsultantEmailConflicts(
  officeId: string,
  claims: ConsultantEmailClaim[],
): Promise<string[]> {
  const normalized = claims
    .map((claim) => ({ ...claim, email: normalizeEmail(claim.email) }))
    .filter((claim) => claim.email.length > 0);
  if (normalized.length === 0) return [];

  const messages: string[] = [];
  const seen = new Set<string>();
  for (const claim of normalized) {
    if (seen.has(claim.email)) {
      messages.push(
        `El correo ${claim.email} está repetido. Cada asesor necesita uno distinto.`,
      );
    }
    seen.add(claim.email);
  }

  const uniqueEmails = [...seen];
  const office = await getAdminOfficeById(officeId);
  const officeEmail = office?.email ? normalizeEmail(office.email) : "";
  if (officeEmail && uniqueEmails.includes(officeEmail)) {
    messages.push("No uses el correo de la promotoría.");
  }

  const { data: rows, error } = await supabaseAdmin
    .from("consultant")
    .select("id, email, consultant_code, office_id, auth_user_id")
    .in("email", uniqueEmails);
  if (error) throw error;

  const owners = (rows ?? []) as Array<{
    id: string;
    email: string | null;
    consultant_code: string | null;
    office_id: string;
    auth_user_id: string | null;
  }>;

  for (const email of uniqueEmails) {
    if (email === officeEmail) continue;
    const matches = owners.filter(
      (row) => normalizeEmail(row.email || "") === email,
    );
    const claimsForEmail = normalized.filter((claim) => claim.email === email);
    const taken = matches.some(
      (row) => !claimsForEmail.some((claim) => claimOwnsRow(claim, row, officeId)),
    );
    if (taken) {
      messages.push(`El correo ${email} ya está registrado. Usa otro.`);
    }
  }

  const authIds = await listAuthUserIdsByEmails(uniqueEmails);
  for (const [email, authId] of authIds) {
    if (authId === officeId || email === officeEmail) {
      if (!messages.some((message) => message.includes("promotoría"))) {
        messages.push("No uses el correo de la promotoría.");
      }
      continue;
    }
    const claimsForEmail = normalized.filter((claim) => claim.email === email);
    const allowed = owners.some(
      (row) =>
        (row.id === authId || row.auth_user_id === authId) &&
        claimsForEmail.some((claim) => claimOwnsRow(claim, row, officeId)),
    );
    if (!allowed && !messages.some((message) => message.includes(email))) {
      messages.push(`El correo ${email} ya está registrado. Usa otro.`);
    }
  }

  return [...new Set(messages)];
}

export async function createConsultantWithAuth(
  officeId: string,
  input: CreateConsultantInput,
  opts?: { allowExistingAuth?: boolean },
): Promise<{ consultant: Consultant; created: boolean }> {
  const emailLower = input.email.trim().toLowerCase();
  let authUserId: string | null = null;
  const consultantCode = input.consultantCode.trim();

  const { data: existingByCode, error: codeLookupError } = await supabaseAdmin
    .from("consultant")
    .select("id, status, email")
    .eq("office_id", officeId)
    .eq("consultant_code", consultantCode)
    .maybeSingle();
  if (codeLookupError) throw codeLookupError;
  if (
    existingByCode &&
    (existingByCode.email || "").trim().toLowerCase() !== emailLower
  ) {
    throw new Error(
      consultantCodeTakenMessage(consultantCode, existingByCode.status),
    );
  }

  const office = await getAdminOfficeById(officeId);
  if (office?.email?.trim().toLowerCase() === emailLower) {
    throw new Error("No uses el correo de la promotoría.");
  }

  const { data: emailOwners, error: emailOwnersError } = await supabaseAdmin
    .from("consultant")
    .select("id, consultant_code, office_id")
    .eq("email", emailLower);
  if (emailOwnersError) throw emailOwnersError;
  const requestedCode = input.consultantCode.trim().toLowerCase();
  for (const owner of emailOwners ?? []) {
    const sameAsesor =
      owner.office_id === officeId &&
      (owner.consultant_code || "").trim().toLowerCase() === requestedCode;
    if (!sameAsesor) {
      throw new Error(`El correo ${emailLower} ya está registrado. Usa otro.`);
    }
  }

  const existingByEmail = await listAuthUserIdsByEmails([emailLower]);
  authUserId = existingByEmail.get(emailLower) ?? null;
  if (authUserId === officeId) {
    throw new Error("No uses el correo de la promotoría.");
  }
  if (authUserId && !opts?.allowExistingAuth) {
    const sameOwner = (emailOwners ?? []).some(
      (owner) =>
        owner.id === authUserId &&
        owner.office_id === officeId &&
        (owner.consultant_code || "").trim().toLowerCase() === requestedCode,
    );
    if (!sameOwner) {
      throw new Error(`El correo ${emailLower} ya está registrado. Usa otro.`);
    }
  }

  if (!authUserId) {
    const { data: authData, error: authError } = await createAuthUser({
      email: emailLower,
      password: input.password,
      emailConfirm: true,
    });

    if (authError) {
      authUserId = await findAuthUserIdByEmail(emailLower);
      if (authUserId === officeId) {
        throw new Error("No uses el correo de la promotoría.");
      }
      if (!authUserId) {
        throw new Error("No se pudo crear el usuario del asesor.");
      }
      if (!opts?.allowExistingAuth) {
        throw new Error(`El correo ${emailLower} ya está registrado. Usa otro.`);
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
    const sameAsesor =
      existingById.office_id === officeId &&
      (existingById.consultant_code || "").trim().toLowerCase() ===
        requestedCode;
    if (sameAsesor) {
      return { consultant: existingById as Consultant, created: false };
    }
    throw new Error(`El correo ${emailLower} ya está registrado. Usa otro.`);
  }

  const { data: anyConsultant } = await supabaseAdmin
    .from("consultant")
    .select("id")
    .eq("auth_user_id", authUserId)
    .maybeSingle();

  if (anyConsultant) {
    throw new Error(`El correo ${emailLower} ya está registrado. Usa otro.`);
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
      status: input.status ?? "PENDING",
    })
    .select()
    .single();

  if (insErr) {
    if (isConsultantCodeUniqueViolation(insErr)) {
      const { data: raced } = await supabaseAdmin
        .from("consultant")
        .select("status")
        .eq("office_id", officeId)
        .eq("consultant_code", consultantCode)
        .maybeSingle();
      throw new Error(
        consultantCodeTakenMessage(consultantCode, raced?.status),
      );
    }
    console.error("createConsultantWithAuth insert:", insErr);
    throw new Error("No se pudo registrar al asesor.");
  }
  return { consultant: inserted as Consultant, created: true };
}

/**
 * For HTML/Excel import: if no consultant with this code exists for the office,
 * create auth user + consultant row with a default email/password.
 * When `name` is provided, use it on create; also refresh placeholder names
 * (empty or equal to the code) on existing rows.
 */
export async function ensureConsultantForImport(
  code: string,
  officeId: string,
  name?: string | null,
): Promise<{ consultant: Consultant | null; created: boolean; error?: string }> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { consultant: null, created: false, error: "Código de asesor vacío" };
  }

  const cleanedName = (name ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.entityName);
  const displayName =
    cleanedName && cleanedName.toLowerCase() !== trimmed.toLowerCase()
      ? cleanedName
      : trimmed;

  const { data: existing } = await supabaseAdmin
    .from("consultant")
    .select("*")
    .eq("consultant_code", trimmed)
    .eq("office_id", officeId)
    .maybeSingle();

  if (existing) {
    const currentName = (existing.name ?? "").trim();
    const hasRealImportName =
      displayName.toLowerCase() !== trimmed.toLowerCase();

    if (
      hasRealImportName &&
      currentName.toLowerCase() !== displayName.toLowerCase()
    ) {
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("consultant")
        .update({ name: displayName })
        .eq("id", existing.id)
        .select()
        .single();
      if (updErr) {
        console.error("ensureConsultantForImport name update:", updErr);
        return { consultant: existing as Consultant, created: false };
      }
      return { consultant: (updated ?? existing) as Consultant, created: false };
    }

    return { consultant: existing as Consultant, created: false };
  }

  // Auto-import accounts: office-scoped email so the same code can exist in another office.
  // Format: <asesorCode>.<officeIdWithoutDashes12>@lifeops.com
  const officeEmailTag = officeId.replace(/-/g, "").slice(0, 12).toLowerCase();
  const defaultEmail = `${trimmed.toLowerCase()}.${officeEmailTag}@lifeops.com`;
  const defaultPassword = "Hola123!!";

  try {
    const result = await createConsultantWithAuth(officeId, {
      consultantCode: trimmed,
      name: displayName,
      email: defaultEmail,
      password: defaultPassword,
      status: "NOT_INVITED",
    }, { allowExistingAuth: true });
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
  opts?: { officeId?: string; consultantId?: string },
): Promise<Array<{ id: string; contract_number: string }>> {
  if (contractNumbers.length === 0) return [];
  const unique = [...new Set(contractNumbers.map((n) => n.trim()).filter(Boolean))];
  const out: Array<{ id: string; contract_number: string }> = [];
  for (const chunk of chunkArray(unique, IMPORT_BATCH_SIZE)) {
    let query = supabaseAdmin
      .from("contract")
      .select("id, contract_number")
      .in("contract_number", chunk);
    if (opts?.officeId) query = query.eq("office_id", opts.officeId);
    if (opts?.consultantId) query = query.eq("consultant_id", opts.consultantId);
    const { data, error } = await query;
    if (error) throw error;
    out.push(...((data || []) as Array<{ id: string; contract_number: string }>));
  }
  return out;
}

/** Promotory invite: create token via service role (after assertOfficeAccess in the route). */
export async function createInvitationTokenAdmin(
  type: string,
  officeId: string,
  consultantEmail: string,
  consultantName: string,
  consultantCode: string,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("create_invitation_token", {
    type,
    office_id: officeId,
    consultant_email: consultantEmail,
    consultant_name: consultantName,
    consultant_code: consultantCode,
  });
  if (error) throw new Error(error.message);
  if (typeof data !== "string" || !data) {
    throw new Error("No se pudo crear el token de invitación.");
  }
  return data;
}

async function revokeActiveInvitationTokensForEmail(
  officeId: string,
  email: string,
): Promise<void> {
  const wanted = email.trim().toLowerCase();
  const { data: tokens, error } = await supabaseAdmin
    .from("token")
    .select("id, metadata")
    .eq("type", "CONSULTANT_INVITATION")
    .eq("status", "ACTIVE");
  if (error) throw error;

  const ids = (tokens ?? [])
    .filter((row) => {
      const meta = (row.metadata || {}) as Record<string, unknown>;
      const tokenEmail =
        typeof meta.consultant_email === "string"
          ? meta.consultant_email.trim().toLowerCase()
          : "";
      const tokenOffice =
        typeof meta.office_id === "string" ? meta.office_id : "";
      return tokenEmail === wanted && tokenOffice === officeId;
    })
    .map((row) => row.id);

  if (ids.length === 0) return;

  const { error: revokeError } = await supabaseAdmin
    .from("token")
    .update({
      status: "USED",
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (revokeError) throw revokeError;
}

/**
 * Reset first-login registration so a new invite can be accepted:
 * delete Auth user (if any), clear auth_user_id, PENDING, revoke old tokens.
 */
export async function resetConsultantInviteRegistrationAdmin(input: {
  officeId: string;
  consultantEmail: string;
  consultantName: string;
  consultantCode: string;
  consultantId?: string;
}): Promise<void> {
  const email = input.consultantEmail.trim().toLowerCase();
  let consultant: {
    id: string;
    auth_user_id: string | null;
    email: string | null;
    status: string | null;
  } | null = null;

  if (input.consultantId) {
    const { data, error } = await supabaseAdmin
      .from("consultant")
      .select("id, auth_user_id, email, status")
      .eq("id", input.consultantId)
      .eq("office_id", input.officeId)
      .maybeSingle();
    if (error) throw error;
    consultant = data;
  }

  if (!consultant) {
    const { data: byEmailRow, error: byEmailError } = await supabaseAdmin
      .from("consultant")
      .select("id, auth_user_id, email, status")
      .eq("office_id", input.officeId)
      .eq("email", email)
      .maybeSingle();
    if (byEmailError) throw byEmailError;
    consultant = byEmailRow;
  }

  if (!consultant && input.consultantCode.trim()) {
    const { data: byCodeRow, error: byCodeError } = await supabaseAdmin
      .from("consultant")
      .select("id, auth_user_id, email, status")
      .eq("office_id", input.officeId)
      .eq("consultant_code", input.consultantCode.trim())
      .maybeSingle();
    if (byCodeError) throw byCodeError;
    consultant = byCodeRow;
  }

  // First-time / incomplete onboarding only — do not wipe Auth for ACTIVE asesores.
  const wipeAuth =
    !consultant ||
    consultant.status === "PENDING" ||
    consultant.status === "NOT_INVITED" ||
    consultant.status === "INACTIVE" ||
    !consultant.auth_user_id;

  if (wipeAuth) {
    const authIds = new Set<string>();
    if (consultant?.auth_user_id) authIds.add(consultant.auth_user_id);
    const byEmail = await findAuthUserIdByEmail(email);
    if (byEmail) authIds.add(byEmail);
    if (consultant?.email && consultant.email.toLowerCase() !== email) {
      const byOld = await findAuthUserIdByEmail(consultant.email);
      if (byOld) authIds.add(byOld);
    }

    for (const authId of authIds) {
      await deleteAuthUser(authId).catch((err) => {
        console.warn("resetConsultantInviteRegistrationAdmin deleteAuth:", err);
      });
    }

    if (consultant) {
      const { error: updateError } = await supabaseAdmin
        .from("consultant")
        .update({
          auth_user_id: null,
          status: "PENDING",
          email,
          name: input.consultantName.trim(),
          consultant_code: input.consultantCode.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", consultant.id)
        .eq("office_id", input.officeId);
      if (updateError) throw updateError;
    }
  } else if (consultant) {
    // ACTIVE with linked Auth: keep login, only refresh profile fields used by the invite.
    const { error: updateError } = await supabaseAdmin
      .from("consultant")
      .update({
        email,
        name: input.consultantName.trim(),
        consultant_code: input.consultantCode.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", consultant.id)
      .eq("office_id", input.officeId);
    if (updateError) throw updateError;
  }

  await revokeActiveInvitationTokensForEmail(input.officeId, email);
  if (consultant?.email && consultant.email.toLowerCase() !== email) {
    await revokeActiveInvitationTokensForEmail(
      input.officeId,
      consultant.email,
    );
  }
}

/**
 * Accept consultant invitation: Auth user + link/create consultant row (service role).
 * Used because client-side signup often has no JWT yet → anon cannot EXECUTE create_consultant.
 * If Auth already exists (half-finished invite), updates password and links the profile.
 */
export async function acceptConsultantInviteAdmin(input: {
  token: string;
  password: string;
}): Promise<
  | { ok: true; email: string }
  | { ok: false; status: number; error: string }
> {
  const { data: tokenRow, error: tokenError } = await supabaseAdmin
    .from("token")
    .select("*")
    .eq("token", input.token)
    .maybeSingle();

  if (tokenError) throw tokenError;
  if (!tokenRow) {
    return { ok: false, status: 404, error: "Invitación no encontrada." };
  }
  if (tokenRow.status !== "ACTIVE" || tokenRow.used_at) {
    return { ok: false, status: 410, error: "Esta invitación ya fue usada." };
  }
  if (new Date(tokenRow.expires_at) < new Date()) {
    return { ok: false, status: 410, error: "Esta invitación expiró." };
  }

  const meta = (tokenRow.metadata || {}) as Record<string, unknown>;
  const officeId = typeof meta.office_id === "string" ? meta.office_id : "";
  const email =
    typeof meta.consultant_email === "string"
      ? meta.consultant_email.trim().toLowerCase()
      : "";
  const name =
    typeof meta.consultant_name === "string" ? meta.consultant_name.trim() : "";
  const code =
    typeof meta.consultant_code === "string"
      ? meta.consultant_code.trim()
      : "";

  if (!officeId || !email || !name || !code) {
    return {
      ok: false,
      status: 400,
      error: "Datos de invitación incompletos.",
    };
  }

  let userId: string | null = null;
  let createdNewAuth = false;

  const { data: authData, error: authError } = await createAuthUser({
    email,
    password: input.password,
    emailConfirm: true,
  });

  if (authData?.user) {
    userId = authData.user.id;
    createdNewAuth = true;
  } else {
    const msg = authError?.message || "No se pudo crear el usuario.";
    if (!/already|registered|exists/i.test(msg)) {
      return { ok: false, status: 400, error: msg };
    }
    const existingId = await findAuthUserIdByEmail(email);
    if (!existingId) {
      return {
        ok: false,
        status: 409,
        error: "Este correo ya está registrado. Inicia sesión.",
      };
    }
    try {
      await updateAuthUserPassword(existingId, input.password);
      await updateAuthUserEmail(existingId, email);
    } catch (e) {
      console.error("acceptConsultantInviteAdmin reuse auth:", e);
      return {
        ok: false,
        status: 500,
        error: "No se pudo actualizar la cuenta existente.",
      };
    }
    userId = existingId;
  }

  const { error: rpcError } = await supabaseAdmin.rpc("create_consultant", {
    user_id: userId,
    user_email: email,
    consultant_name: name,
    consultant_code_param: code,
    office_id_param: officeId,
  });
  if (rpcError) {
    console.error("acceptConsultantInviteAdmin create_consultant:", rpcError);
    if (createdNewAuth && userId) {
      await deleteAuthUser(userId).catch(() => undefined);
    }
    return {
      ok: false,
      status: 500,
      error: "No se pudo crear el perfil de asesor.",
    };
  }

  // Ensure link even if RPC matched an existing row without updating auth_user_id.
  const linkPatch = {
    auth_user_id: userId,
    status: "ACTIVE" as const,
    email,
    name,
    consultant_code: code,
    updated_at: new Date().toISOString(),
  };
  const { data: linkedByAuth } = await supabaseAdmin
    .from("consultant")
    .update(linkPatch)
    .eq("office_id", officeId)
    .eq("auth_user_id", userId)
    .select("id");
  if (!linkedByAuth?.length) {
    const { data: linkedByEmail } = await supabaseAdmin
      .from("consultant")
      .update(linkPatch)
      .eq("office_id", officeId)
      .eq("email", email)
      .select("id");
    if (!linkedByEmail?.length) {
      await supabaseAdmin
        .from("consultant")
        .update(linkPatch)
        .eq("office_id", officeId)
        .eq("consultant_code", code);
    }
  }

  const { error: markError } = await supabaseAdmin
    .from("token")
    .update({
      status: "USED",
      used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tokenRow.id);
  if (markError) {
    console.error("acceptConsultantInviteAdmin mark token:", markError);
  }

  return { ok: true, email };
}

type ConsultantAdminRow = {
  id: string;
  office_id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  consultant_code: string | null;
  status: string | null;
};

async function getConsultantInOffice(
  consultantId: string,
  officeId: string,
): Promise<ConsultantAdminRow | null> {
  const { data, error } = await supabaseAdmin
    .from("consultant")
    .select("id, office_id, auth_user_id, email, name, consultant_code, status")
    .eq("id", consultantId)
    .eq("office_id", officeId)
    .maybeSingle();
  if (error) throw error;
  return (data as ConsultantAdminRow | null) ?? null;
}

async function syncInvitationTokenEmailsAdmin(
  officeId: string,
  fromEmail: string,
  toEmail: string,
  name: string | null,
  code: string | null,
): Promise<void> {
  const from = fromEmail.trim().toLowerCase();
  const to = toEmail.trim().toLowerCase();
  if (!from || !to || from === to) return;

  const { data: tokens, error } = await supabaseAdmin
    .from("token")
    .select("id, metadata")
    .eq("type", "CONSULTANT_INVITATION")
    .eq("status", "ACTIVE");
  if (error) throw error;

  for (const row of tokens ?? []) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const tokenEmail =
      typeof meta.consultant_email === "string"
        ? meta.consultant_email.trim().toLowerCase()
        : "";
    const tokenOffice =
      typeof meta.office_id === "string" ? meta.office_id : "";
    if (tokenEmail !== from || tokenOffice !== officeId) continue;

    const nextMeta = {
      ...meta,
      consultant_email: to,
      consultant_name: name ?? meta.consultant_name,
      consultant_code: code ?? meta.consultant_code,
    };
    const { error: updError } = await supabaseAdmin
      .from("token")
      .update({
        metadata: nextMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    if (updError) throw updError;
  }
}

async function countContractsForConsultant(consultantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("contract")
    .select("id", { count: "exact", head: true })
    .eq("consultant_id", consultantId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Soft-deactivate (INACTIVE) by default; hard-delete only when forceDelete
 * and the asesor has zero contracts.
 */
export async function deactivateOrDeleteConsultantAdmin(input: {
  consultantId: string;
  officeId: string;
  forceDelete?: boolean;
  actorUserId?: string;
}): Promise<
  AdminResult<
    | {
        action: "deleted";
        deletedContracts: 0;
        name: string | null;
        consultantCode: string | null;
      }
    | {
        action: "deactivated";
        contractCount: number;
        name: string | null;
        consultantCode: string | null;
      }
  >
> {
  const consultant = await getConsultantInOffice(
    input.consultantId,
    input.officeId,
  );
  if (!consultant) {
    return { ok: false, code: "not_found", error: "Asesor no encontrado." };
  }

  const contracts = await countContractsForConsultant(input.consultantId);

  if (input.forceDelete) {
    if (contracts > 0) {
      return {
        ok: false,
        code: "conflict",
        error:
          "No se puede eliminar: el asesor tiene pólizas. Desactívalo en su lugar.",
      };
    }

    const { error: deleteError } = await supabaseAdmin
      .from("consultant")
      .delete()
      .eq("id", input.consultantId)
      .eq("office_id", input.officeId);
    if (deleteError) throw deleteError;

    const authUserId = consultant.auth_user_id || consultant.id;
    if (authUserId) {
      const { error: authDeleteError } = await deleteAuthUser(authUserId);
      if (authDeleteError) {
        console.error(
          `deactivateOrDeleteConsultantAdmin: auth user ${authUserId}:`,
          authDeleteError,
        );
      }
    }

    await writeAuditLog(supabaseAdmin, {
      officeId: input.officeId,
      actorUserId: input.actorUserId ?? null,
      actorRole: "office",
      action: "consultant.delete",
      entityType: "consultant",
      entityId: input.consultantId,
      source: "api",
      newValues: {
        name: consultant.name,
        consultant_code: consultant.consultant_code,
      },
    });

    return {
      ok: true,
      data: {
        action: "deleted",
        deletedContracts: 0,
        name: consultant.name,
        consultantCode: consultant.consultant_code,
      },
    };
  }

  const { error: updateError } = await supabaseAdmin
    .from("consultant")
    .update({ status: "INACTIVE", updated_at: new Date().toISOString() })
    .eq("id", input.consultantId)
    .eq("office_id", input.officeId);
  if (updateError) throw updateError;

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId ?? null,
    actorRole: "office",
    action: "consultant.deactivate",
    entityType: "consultant",
    entityId: input.consultantId,
    source: "api",
    oldValues: { status: consultant.status },
    newValues: {
      status: "INACTIVE",
      name: consultant.name,
      consultant_code: consultant.consultant_code,
      contract_count: contracts,
    },
  });

  return {
    ok: true,
    data: {
      action: "deactivated",
      contractCount: contracts,
      name: consultant.name,
      consultantCode: consultant.consultant_code,
    },
  };
}

export async function updateConsultantAdmin(input: {
  consultantId: string;
  officeId: string;
  updates: {
    name?: string;
    email?: string | null;
    consultant_code?: string | null;
    status?: "ACTIVE" | "INACTIVE" | "PENDING" | "NOT_INVITED";
  };
}): Promise<AdminResult<{ success: true }>> {
  const consultant = await getConsultantInOffice(
    input.consultantId,
    input.officeId,
  );
  if (!consultant) {
    return { ok: false, code: "not_found", error: "Asesor no encontrado." };
  }

  const nextEmail =
    input.updates.email === undefined
      ? undefined
      : input.updates.email?.trim().toLowerCase() || null;
  const oldEmail = consultant.email?.trim().toLowerCase() || null;

  if (nextEmail && nextEmail !== oldEmail) {
    const conflicts = await findConsultantEmailConflicts(input.officeId, [
      { email: nextEmail, consultantId: input.consultantId },
    ]);
    if (conflicts.length > 0) {
      return { ok: false, code: "conflict", error: conflicts[0] };
    }
  }

  const nextCode = input.updates.consultant_code?.trim();
  if (nextCode && nextCode !== (consultant.consultant_code || "").trim()) {
    const { data: takenCode, error: takenCodeError } = await supabaseAdmin
      .from("consultant")
      .select("id, status")
      .eq("office_id", input.officeId)
      .eq("consultant_code", nextCode)
      .neq("id", input.consultantId)
      .maybeSingle();
    if (takenCodeError) throw takenCodeError;
    if (takenCode) {
      return {
        ok: false,
        code: "conflict",
        error: consultantCodeTakenMessage(nextCode, takenCode.status),
      };
    }
  }

  const patch: Record<string, unknown> = {
    ...input.updates,
    updated_at: new Date().toISOString(),
  };
  if (nextEmail !== undefined) {
    patch.email = nextEmail;
  }

  // Keep Auth + consultant.email + pending invites aligned.
  if (nextEmail !== undefined && nextEmail !== oldEmail) {
    let authUserId = consultant.auth_user_id;
    if (!authUserId && oldEmail) {
      authUserId = await findAuthUserIdByEmail(oldEmail);
    }
    if (!authUserId && nextEmail) {
      authUserId = await findAuthUserIdByEmail(nextEmail);
    }

    if (authUserId && nextEmail) {
      await updateAuthUserEmail(authUserId, nextEmail);
      patch.auth_user_id = authUserId;
    }

    if (oldEmail && nextEmail) {
      await syncInvitationTokenEmailsAdmin(
        input.officeId,
        oldEmail,
        nextEmail,
        input.updates.name ?? consultant.name,
        input.updates.consultant_code ?? consultant.consultant_code,
      );
    }
  }

  const { error } = await supabaseAdmin
    .from("consultant")
    .update(patch)
    .eq("id", input.consultantId)
    .eq("office_id", input.officeId);
  if (error) {
    if (isConsultantCodeUniqueViolation(error)) {
      const clave = (
        input.updates.consultant_code ||
        consultant.consultant_code ||
        ""
      ).trim();
      const { data: taken } = await supabaseAdmin
        .from("consultant")
        .select("status")
        .eq("office_id", input.officeId)
        .eq("consultant_code", clave)
        .neq("id", input.consultantId)
        .maybeSingle();
      return {
        ok: false,
        code: "conflict",
        error: consultantCodeTakenMessage(clave, taken?.status),
      };
    }
    throw error;
  }

  return { ok: true, data: { success: true } };
}

export async function reassignContractAdmin(input: {
  officeId: string;
  contractId: string;
  toConsultantId: string;
  actorUserId: string;
  notes?: string | null;
}): Promise<
  AdminResult<{
    contract: {
      id: string;
      consultant_id: string;
      office_id: string;
      contract_number: string | null;
    };
    fromConsultantId: string;
    toConsultantId: string;
    toConsultantName: string | null;
  }>
> {
  const { data: contract, error: contractError } = await supabaseAdmin
    .from("contract")
    .select("id, office_id, consultant_id, contract_number, client_id")
    .eq("id", input.contractId)
    .eq("office_id", input.officeId)
    .maybeSingle();
  if (contractError) throw contractError;
  if (!contract) {
    return { ok: false, code: "not_found", error: "Póliza no encontrada." };
  }

  if (contract.consultant_id === input.toConsultantId) {
    return {
      ok: false,
      code: "invalid",
      error: "La póliza ya pertenece a ese asesor.",
    };
  }

  const toConsultant = await getConsultantInOffice(
    input.toConsultantId,
    input.officeId,
  );
  if (!toConsultant) {
    return {
      ok: false,
      code: "not_found",
      error: "Asesor destino no encontrado en esta promotoría.",
    };
  }
  if (toConsultant.status === "INACTIVE") {
    return {
      ok: false,
      code: "invalid",
      error: "No puedes reasignar a un asesor inactivo.",
    };
  }

  const fromConsultantId = contract.consultant_id as string;

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("contract")
    .update({
      consultant_id: input.toConsultantId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.contractId)
    .eq("office_id", input.officeId)
    .select("id, consultant_id, office_id, contract_number")
    .single();
  if (updateError) throw updateError;

  await writeAuditLog(supabaseAdmin, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: "office",
    action: "contract.reassign",
    entityType: "contract",
    entityId: input.contractId,
    source: "api",
    oldValues: { consultant_id: fromConsultantId },
    newValues: {
      consultant_id: input.toConsultantId,
      notes: input.notes?.trim() || null,
      contract_number: (contract.contract_number as string | null) ?? null,
    },
  });

  return {
    ok: true,
    data: {
      contract: updated as {
        id: string;
        consultant_id: string;
        office_id: string;
        contract_number: string | null;
      },
      fromConsultantId,
      toConsultantId: input.toConsultantId,
      toConsultantName: toConsultant.name,
    },
  };
}

export type DocumentContractRow = {
  id: string;
  contract_number: string | null;
  consultant_id: string;
  office_id: string | null;
};

export async function getContractForDocumentUploadAdmin(
  contractId: string,
): Promise<DocumentContractRow | null> {
  const { data, error } = await supabaseAdmin
    .from("contract")
    .select("id, contract_number, consultant_id, consultant:consultant_id(id, office_id)")
    .eq("id", contractId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const consultant = Array.isArray(data.consultant)
    ? data.consultant[0]
    : data.consultant;
  const officeId = (consultant as { office_id?: string } | null)?.office_id ?? null;

  return {
    id: data.id as string,
    contract_number: (data.contract_number as string | null) ?? null,
    consultant_id: data.consultant_id as string,
    office_id: officeId,
  };
}

export async function changeRequestBelongsToContractAdmin(
  changeRequestId: string,
  contractId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("contract_change_request")
    .select("id, contract_id")
    .eq("id", changeRequestId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.contract_id === contractId);
}

export async function collectionPaymentBelongsToContractAdmin(
  collectionPaymentId: string,
  contractId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("contract_collection_payment")
    .select("id, contract_id")
    .eq("id", collectionPaymentId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.contract_id === contractId);
}

export type InsertFileRecordInput = {
  officeId: string;
  consultantId: string;
  contractId: string;
  changeRequestId: string | null;
  collectionPaymentId: string | null;
  displayName: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number;
};

export async function insertFileRecordAdmin(input: InsertFileRecordInput) {
  return supabaseAdmin
    .from("file")
    .insert({
      office_id: input.officeId,
      consultant_id: input.consultantId,
      contract_id: input.contractId,
      change_request_id: input.changeRequestId,
      collection_payment_id: input.collectionPaymentId,
      display_name: input.displayName,
      file_name: input.fileName,
      file_path: input.filePath,
      file_type: input.fileType,
      file_size: input.fileSize,
      file_url: null,
      status: "ACTIVE",
      metadata: {},
    })
    .select()
    .single();
}

export type FileRowForSignedUrl = {
  id: string;
  office_id: string;
  consultant_id: string;
  file_path: string;
  display_name: string | null;
  file_name: string | null;
};

export async function getFileRowForSignedUrlAdmin(
  fileId: string,
): Promise<FileRowForSignedUrl | null> {
  const { data, error } = await supabaseAdmin
    .from("file")
    .select("id, office_id, consultant_id, file_path, display_name, file_name")
    .eq("id", fileId)
    .maybeSingle();
  if (error) throw error;
  return (data as FileRowForSignedUrl | null) ?? null;
}

export type OfficeCleanupResult = {
  success: true;
  deletedContracts: number;
  deletedConsultants: number;
  deletedClients: true;
  deletedAuthUsers: number;
  deletedCollectionData: true;
};

async function deleteOfficeDocumentsAdmin(officeId: string): Promise<void> {
  const { data: officeFiles, error: filesFetchError } = await supabaseAdmin
    .from("file")
    .select("id, file_path")
    .eq("office_id", officeId);
  if (filesFetchError) {
    throw new Error("No se pudieron obtener los documentos.");
  }

  const filePaths = (officeFiles || [])
    .map((f: { file_path?: string }) => f.file_path)
    .filter((p): p is string => !!p);

  if (filePaths.length > 0) {
    const { error: storageDeleteError } = await removeDocumentObjects(filePaths);
    if (storageDeleteError) {
      console.error("Error deleting storage objects:", storageDeleteError);
    }
  }

  const { error: filesDeleteError } = await supabaseAdmin
    .from("file")
    .delete()
    .eq("office_id", officeId);
  if (filesDeleteError) {
    throw new Error("No se pudieron eliminar los documentos.");
  }
}

/**
 * Wipe office operational data (documents, contracts, consultants, clients, auth users).
 * Caller must already have asserted promotory + office access.
 */
export async function cleanupOfficeDataAdmin(
  officeId: string,
): Promise<OfficeCleanupResult> {
  const { data: consultants, error: consultantsError } = await supabaseAdmin
    .from("consultant")
    .select("id, auth_user_id")
    .eq("office_id", officeId);

  if (consultantsError) {
    throw new Error("No se pudieron obtener los asesores.");
  }

  const consultantIds = (consultants || []).map(
    (c: { id: string }) => c.id,
  );
  const authUserIds = (consultants || [])
    .map((c: { auth_user_id: string | null }) => c.auth_user_id)
    .filter((id): id is string => !!id);

  if (consultantIds.length === 0) {
    await deleteOfficeDocumentsAdmin(officeId);

    const { error: auditDeleteError } = await supabaseAdmin
      .from("audit_log")
      .delete()
      .eq("office_id", officeId);
    if (auditDeleteError) {
      throw new Error("No se pudo eliminar el historial de actividad.");
    }

    const { error: importDeleteError } = await supabaseAdmin
      .from("commission_import")
      .delete()
      .eq("office_id", officeId);
    if (importDeleteError) {
      throw new Error("No se pudieron eliminar los lotes de importación.");
    }

    const { error: clientsDeleteError } = await supabaseAdmin
      .from("client")
      .delete()
      .eq("office_id", officeId);
    if (clientsDeleteError) {
      throw new Error("No se pudieron eliminar los clientes.");
    }

    return {
      success: true,
      deletedContracts: 0,
      deletedConsultants: 0,
      deletedClients: true,
      deletedAuthUsers: 0,
      deletedCollectionData: true,
    };
  }

  const { data: contracts, error: contractsError } = await supabaseAdmin
    .from("contract")
    .select("id")
    .in("consultant_id", consultantIds);

  if (contractsError) {
    throw new Error("No se pudieron obtener las pólizas.");
  }

  const contractIds = (contracts || []).map((c: { id: string }) => c.id);

  await deleteOfficeDocumentsAdmin(officeId);

  if (contractIds.length > 0) {
    const { error: paymentsError } = await supabaseAdmin
      .from("contract_collection_payment")
      .delete()
      .in("contract_id", contractIds);
    if (paymentsError) {
      throw new Error("No se pudieron eliminar los pagos de cobranza.");
    }

    const { error: ccrError } = await supabaseAdmin
      .from("contract_change_request")
      .delete()
      .in("contract_id", contractIds);
    if (ccrError) {
      throw new Error("No se pudieron eliminar las solicitudes de cambio.");
    }

    const { error: detailsError } = await supabaseAdmin
      .from("contract_detail")
      .delete()
      .in("contract_id", contractIds);
    if (detailsError) {
      throw new Error("No se pudieron eliminar los detalles de póliza.");
    }

    const { error: contractsDeleteError } = await supabaseAdmin
      .from("contract")
      .delete()
      .in("id", contractIds);
    if (contractsDeleteError) {
      throw new Error("No se pudieron eliminar las pólizas.");
    }
  }

  const { error: auditDeleteError } = await supabaseAdmin
    .from("audit_log")
    .delete()
    .eq("office_id", officeId);
  if (auditDeleteError) {
    throw new Error("No se pudo eliminar el historial de actividad.");
  }

  const { error: importDeleteError } = await supabaseAdmin
    .from("commission_import")
    .delete()
    .eq("office_id", officeId);
  if (importDeleteError) {
    throw new Error("No se pudieron eliminar los lotes de importación.");
  }

  const { error: clientsDeleteError } = await supabaseAdmin
    .from("client")
    .delete()
    .eq("office_id", officeId);
  if (clientsDeleteError) {
    throw new Error("No se pudieron eliminar los clientes.");
  }

  const { error: consultantsDeleteError } = await supabaseAdmin
    .from("consultant")
    .delete()
    .in("id", consultantIds);
  if (consultantsDeleteError) {
    throw new Error("No se pudieron eliminar los asesores.");
  }

  let deletedAuthCount = 0;
  for (const uid of authUserIds) {
    const { error: authDeleteError } = await deleteAuthUser(uid);
    if (authDeleteError) {
      console.error(`cleanupOfficeDataAdmin: auth user ${uid}:`, authDeleteError);
    } else {
      deletedAuthCount += 1;
    }
  }

  return {
    success: true,
    deletedContracts: contractIds.length,
    deletedConsultants: consultantIds.length,
    deletedClients: true,
    deletedAuthUsers: deletedAuthCount,
    deletedCollectionData: true,
  };
}
