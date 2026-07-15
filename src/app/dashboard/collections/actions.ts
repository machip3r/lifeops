"use server";

import { createUserClient } from "@/lib/supabase/user-client";
import {
  clearCollectionPayment,
  getCollectionAuditLog,
  getCollectionsGrid,
  updateCollectionDay,
  updateCollectionStatus,
  updatePaymentChannel,
  updateProjectName,
  upsertCollectionPayment,
} from "@/lib/collections/service";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import {
  clearCollectionPaymentSchema,
  getCollectionAuditLogSchema,
  getCollectionsGridSchema,
  updateCollectionDaySchema,
  updateCollectionStatusSchema,
  updatePaymentChannelSchema,
  updateProjectNameSchema,
  upsertCollectionPaymentSchema,
} from "@/lib/validation/schemas";

type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

function requireToken(accessToken: string | undefined | null): ActionFailure | null {
  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 20) {
    return { ok: false, error: "No autenticado." };
  }
  return null;
}

export async function getCollectionsGridAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = getCollectionsGridSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return getCollectionsGrid(client, parsed.data.year, {
    page: parsed.data.page,
    pageSize: parsed.data.pageSize,
  });
}

export async function updateCollectionStatusAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = updateCollectionStatusSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return updateCollectionStatus(
    client,
    parsed.data.contractId,
    parsed.data.status,
  );
}

export async function updateCollectionDayAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = updateCollectionDaySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return updateCollectionDay(
    client,
    parsed.data.contractId,
    parsed.data.collectionDay,
  );
}

export async function updatePaymentChannelAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = updatePaymentChannelSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error, undefined, {
        paymentChannel: "invalid",
      }),
    };
  }

  const client = createUserClient(accessToken);
  return updatePaymentChannel(
    client,
    parsed.data.contractId,
    parsed.data.paymentChannel,
  );
}

export async function updateProjectNameAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = updateProjectNameSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error, undefined, {
        projectName: "entityName",
      }),
    };
  }

  const client = createUserClient(accessToken);
  return updateProjectName(
    client,
    parsed.data.contractId,
    parsed.data.projectName,
  );
}

export async function upsertCollectionPaymentAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = upsertCollectionPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error, undefined, {
        paidAt: "date",
        scheduledDay: "invalid",
        amount: "invalid",
        notes: "notes",
      }),
    };
  }

  const client = createUserClient(accessToken);
  return upsertCollectionPayment(client, {
    contractId: parsed.data.contractId,
    year: parsed.data.year,
    month: parsed.data.month,
    paidAt: parsed.data.paidAt,
    scheduledDay: parsed.data.scheduledDay,
    amount: parsed.data.amount ?? null,
    notes: parsed.data.notes ?? null,
  });
}

export async function clearCollectionPaymentAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = clearCollectionPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return clearCollectionPayment(client, parsed.data);
}

export async function getCollectionAuditLogAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = getCollectionAuditLogSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Datos inválidos.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return getCollectionAuditLog(client, {
    contractId: parsed.data.contractId,
    limit: parsed.data.limit,
  });
}
