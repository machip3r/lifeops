/** Consultant invitation tokens: create, reset, accept, keep emails in sync. */
import "server-only";

import { createAuthUser, deleteAuthUser, findAuthUserIdByEmail, updateAuthUserEmail, updateAuthUserPassword } from "@/lib/auth/admin";
import { getAuthErrorCode, getAuthErrorMessage } from "@/lib/auth/error-messages";
import { supabaseAdmin } from "@/lib/supabase/admin";

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
    const authErrorCode = getAuthErrorCode(authError);
    if (authErrorCode !== "email_exists" && authErrorCode !== "user_already_exists") {
      return { ok: false, status: 400, error: getAuthErrorMessage(authError, "invitation") };
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
        error: getAuthErrorMessage(e, "invitation"),
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

export async function syncInvitationTokenEmailsAdmin(
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
