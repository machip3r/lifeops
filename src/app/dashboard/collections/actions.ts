"use server";

import { createUserClient } from "@/lib/supabase/user-client";
import {
  clearCollectionPayment,
  upsertCollectionPayment,
} from "@/lib/collections/service";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import {
  clearCollectionPaymentSchema,
  upsertCollectionPaymentSchema,
} from "@/lib/validation/schemas";

type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

function requireToken(
  accessToken: string | undefined | null,
): ActionFailure | null {
  if (!accessToken || typeof accessToken !== "string" || accessToken.length < 20) {
    return { ok: false, error: "No autenticado." };
  }
  return null;
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
  return clearCollectionPayment(client, {
    contractId: parsed.data.contractId,
    year: parsed.data.year,
    month: parsed.data.month,
  });
}
