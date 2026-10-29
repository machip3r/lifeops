"use server";

import { resolveOfficeContext } from "@/lib/auth/api";
import { createDb } from "@/lib/db";
import { deleteContractAdmin } from "@/lib/db-admin";
import { syncEditedDetailPayment } from "@/lib/db/collections-service";
import { createManualContract } from "@/lib/db/manual-contract";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import {
  createManualContractSchema,
  deleteContractSchema,
  rehabilitateContractSchema,
  updateContractDetailSchema,
  updateContractSchema,
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

export async function createManualContractAction(
  accessToken: string,
  input: unknown,
) {
  const authErr = requireToken(accessToken);
  if (authErr) return authErr;

  const parsed = createManualContractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Revisa los datos del formulario.",
      fieldErrors: zodFieldErrors(parsed.error),
    };
  }

  const client = createUserClient(accessToken);
  return createManualContract(client, parsed.data);
}

/** Full póliza edit with `contract.update` audit (RLS decides who may edit it). */
export async function updateContractAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsed = updateContractSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Revisa los datos marcados.",
      // A legacy forma de pago outside the catalog is invalid, not missing
      fieldErrors: zodFieldErrors(parsed.error, undefined, { paymentMethod: "invalid" }),
    };
  }

  const { contractId, ...v } = parsed.data;
  const db = createDb(createUserClient(accessToken));
  try {
    return await db.contract.updateWithAudit(
      contractId,
      {
        contract_number: v.contractNumber,
        issue_date: v.issueDate,
        payment_method: v.paymentMethod ?? null,
        collection_day: v.collectionDay ?? null,
        currency: v.currency ?? null,
        annual_premium: v.annualPremium ?? null,
        insured_amount: v.insuredAmount ?? null,
        project_name: v.projectName ?? null,
        plan_classification: v.planClassification ?? null,
        payment_channel: v.paymentChannel ?? null,
        status: v.status,
      },
      { userId: auth.ctx.user.id, officeId: auth.ctx.officeId, role: auth.ctx.role },
    );
  } catch (error) {
    console.error("updateContractAction:", error);
    return { ok: false as const, error: "No se pudo guardar la póliza. Intenta de nuevo." };
  }
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rehabilitar: an anulada póliza is en vigor again and enters cobranza (`contract.update` audit). */
export async function rehabilitateContractAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsed = rehabilitateContractSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Póliza no válida." };

  const db = createDb(createUserClient(accessToken));
  try {
    const contract = await db.contract.getContractById(parsed.data.contractId);
    if (!contract) return { ok: false as const, error: "No encontramos la póliza." };
    if (contract.status !== "ANNULLED") {
      return { ok: false as const, error: "Solo se puede rehabilitar una póliza anulada." };
    }
    return await db.contract.updateWithAudit(
      contract.id,
      // Rehabilitating settles the overdue receipts: up to today counts as paid
      { status: "IN_FORCE", in_force_as_of: todayIso() },
      { userId: auth.ctx.user.id, officeId: auth.ctx.officeId, role: auth.ctx.role },
    );
  } catch (error) {
    console.error("rehabilitateContractAction:", error);
    return { ok: false as const, error: "No se pudo rehabilitar la póliza. Intenta de nuevo." };
  }
}

/** Delete one póliza (documents, recibos and cobranza go with it), with `contract.delete` audit. */
export async function deleteContractAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };

  const parsed = deleteContractSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Póliza no válida." };

  try {
    const result = await deleteContractAdmin({
      contractId: parsed.data.contractId,
      officeId: auth.ctx.officeId,
      consultantId: auth.ctx.role === "consultant" ? auth.ctx.consultantId : undefined,
      actorUserId: auth.ctx.user.id,
      actorRole: auth.ctx.role,
    });
    return result.ok ? { ok: true as const } : { ok: false as const, error: result.error };
  } catch (error) {
    console.error("deleteContractAction:", error);
    return { ok: false as const, error: "No se pudo eliminar la póliza. Intenta de nuevo." };
  }
}

/**
 * Edit one commission-file receipt (promotoría only) with `contract_detail.update` audit; the
 * cobranza import mark follows the new FECHA PAGO / PRIMA COBRO.
 */
export async function updateContractDetailAction(accessToken: string, input: unknown) {
  const auth = await resolveOfficeContext(accessToken);
  if (!auth.ok) return { ok: false as const, error: auth.error };
  if (auth.ctx.role !== "promotory") {
    return { ok: false as const, error: "Solo la promotoría puede editar los recibos." };
  }

  const parsed = updateContractDetailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false as const,
      error: "Revisa los datos marcados.",
      fieldErrors: zodFieldErrors(parsed.error, undefined, {
        paymentMethod: "invalid",
        premiumPayment: "amount",
        collectionPremium: "amount",
        targetPremium: "amount",
        commissionPremium: "amount",
        commissionHonoraries: "amount",
        commissionPercentage: "amount",
      }),
    };
  }

  const { detailId, ...v } = parsed.data;
  const userClient = createUserClient(accessToken);
  const db = createDb(userClient);
  try {
    const result = await db.contractDetail.updateWithAudit(
      detailId,
      {
        receipt_number: v.receiptNumber ?? null,
        issue_date: v.issueDate,
        payment_date: v.paymentDate,
        payment_method: v.paymentMethod ?? null,
        premium_payment: v.premiumPayment ?? null,
        collection_premium: v.collectionPremium ?? null,
        target_premium: v.targetPremium ?? null,
        commission_premium: v.commissionPremium ?? null,
        commission_honoraries: v.commissionHonoraries ?? null,
        commission_percentage: v.commissionPercentage ?? null,
        seniority: v.seniority ?? null,
        movement: v.movement ?? null,
      },
      { userId: auth.ctx.user.id, officeId: auth.ctx.officeId, role: auth.ctx.role },
    );
    if (!result.ok) return result;
    await syncEditedDetailPayment(userClient, {
      officeId: auth.ctx.officeId,
      actorUserId: auth.ctx.user.id,
      before: result.data.before,
      after: result.data.after,
    });
    return { ok: true as const, data: result.data.after };
  } catch (error) {
    console.error("updateContractDetailAction:", error);
    return { ok: false as const, error: "No se pudo guardar el recibo. Intenta de nuevo." };
  }
}
