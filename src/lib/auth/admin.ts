/**
 * Privileged Auth Admin adapter — server only.
 * Create / update / delete Auth users; list users for email lookup.
 */
import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

/** Auth Admin has no get-by-email; paginate until the address is found. */
export async function findAuthUserIdByEmail(
  targetEmail: string,
): Promise<string | null> {
  const wanted = targetEmail.toLowerCase();
  const perPage = 1000;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
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

export async function listAuthUserIdsByEmails(
  emails: string[],
): Promise<Map<string, string>> {
  const emailSet = new Set(emails.map((e) => e.toLowerCase()).filter(Boolean));
  const result = new Map<string, string>();
  if (emailSet.size === 0) return result;

  const perPage = 1000;
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
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

export async function createAuthUser(opts: {
  email: string;
  password: string;
  emailConfirm?: boolean;
}) {
  return supabaseAdmin.auth.admin.createUser({
    email: opts.email,
    password: opts.password,
    email_confirm: opts.emailConfirm ?? true,
  });
}

export async function updateAuthUserEmail(
  authUserId: string,
  email: string | null | undefined,
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    email: email || undefined,
    email_confirm: true,
  });
  if (error) {
    throw new Error(
      `Error al actualizar el correo en el sistema de autenticación: ${error.message}`,
    );
  }
}

export async function updateAuthUserPassword(
  authUserId: string,
  password: string,
): Promise<void> {
  const { error } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
    password,
  });
  if (error) {
    throw new Error(
      `Error al actualizar la contraseña: ${error.message}`,
    );
  }
}

export async function deleteAuthUser(authUserId: string) {
  return supabaseAdmin.auth.admin.deleteUser(authUserId);
}
