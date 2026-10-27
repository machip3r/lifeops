/** Asesores: create (with Auth user), import ensure, update, deactivate/delete. */
import "server-only";

import { createAuthUser, deleteAuthUser, findAuthUserIdByEmail, listAuthUserIdsByEmails, updateAuthUserEmail } from "@/lib/auth/admin";
import { auditDiff, writeAuditLog } from "@/lib/db/audit-log";
import type { Consultant } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { LIMITS } from "@/lib/validation/schemas";
import { deleteContractsCascadeAdmin } from "./contract-cascade";
import { syncInvitationTokenEmailsAdmin } from "./invites";
import { type AdminResult } from "./result";
import { getAdminOfficeById } from "./tenancy";

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

type ConsultantAdminRow = {
  id: string;
  office_id: string;
  auth_user_id: string | null;
  email: string | null;
  name: string | null;
  consultant_code: string | null;
  status: string | null;
};

export async function getConsultantInOffice(
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

async function countContractsForConsultant(consultantId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("contract")
    .select("id", { count: "exact", head: true })
    .eq("consultant_id", consultantId);
  if (error) throw error;
  return count ?? 0;
}

/**
 * Soft-deactivate (INACTIVE) by default. `forceDelete` hard-deletes the asesor (and its
 * LifeOps access); with pólizas it also needs `withContracts`, which deletes them first.
 */
export async function deactivateOrDeleteConsultantAdmin(input: {
  consultantId: string;
  officeId: string;
  forceDelete?: boolean;
  /** Delete the asesor's pólizas too (confirmed in the UI) */
  withContracts?: boolean;
  actorUserId?: string;
}): Promise<
  AdminResult<
    | {
        action: "deleted";
        deletedContracts: number;
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
    if (contracts > 0 && !input.withContracts) {
      return {
        ok: false,
        code: "conflict",
        error:
          "No se puede eliminar: el asesor tiene pólizas. Desactívalo en su lugar.",
      };
    }

    let deletedContracts = 0;
    if (contracts > 0) {
      const { data: rows, error: rowsError } = await supabaseAdmin
        .from("contract")
        .select("id")
        .eq("consultant_id", input.consultantId)
        .eq("office_id", input.officeId);
      if (rowsError) throw rowsError;
      deletedContracts = await deleteContractsCascadeAdmin((rows ?? []).map((r: { id: string }) => r.id));
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
      oldValues: {
        name: consultant.name,
        consultant_code: consultant.consultant_code,
        email: consultant.email,
      },
      newValues: { deleted_contracts: deletedContracts },
    });

    return {
      ok: true,
      data: {
        action: "deleted",
        deletedContracts,
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
  /** Who edits (audit `consultant.update`) */
  actorUserId?: string | null;
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

  const { oldValues, newValues } = auditDiff(
    consultant as unknown as Record<string, unknown>,
    { ...input.updates, ...(nextEmail !== undefined ? { email: nextEmail } : {}) },
  );
  if (Object.keys(newValues).length > 0) {
    await writeAuditLog(supabaseAdmin, {
      officeId: input.officeId,
      actorUserId: input.actorUserId ?? null,
      actorRole: "office",
      action: "consultant.update",
      entityType: "consultant",
      entityId: input.consultantId,
      source: "ui",
      oldValues: { ...oldValues, name: consultant.name },
      newValues: { ...newValues, name: input.updates.name ?? consultant.name },
    });
  }

  return { ok: true, data: { success: true } };
}
