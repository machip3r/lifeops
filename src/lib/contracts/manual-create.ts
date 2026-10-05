import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/audit/write";
import { upsertCollectionPayment } from "@/lib/collections/service";
import type { Contract } from "@/lib/supabase";

export type ManualContractInput = {
  consultantId?: string | null;
  contractNumber: string;
  clientId?: string | null;
  clientName: string;
  birthDate?: string | null;
  issueDate: string;
  collectionDay: number;
  lastPaymentDate: string;
  projectName: string;
  paymentMethod: string;
};

type Actor = {
  userId: string;
  officeId: string;
  role: "promotory" | "consultant";
  consultantId?: string;
};

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function resolveActor(client: SupabaseClient): Promise<Result<Actor>> {
  const {
    data: { user },
    error,
  } = await client.auth.getUser();
  if (error || !user) {
    return { ok: false, error: "No autenticado." };
  }

  const { data: office } = await client
    .from("office")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();

  if (office) {
    return {
      ok: true,
      data: { userId: user.id, officeId: office.id, role: "promotory" },
    };
  }

  const { data: consultant } = await client
    .from("consultant")
    .select("id, office_id")
    .or(`id.eq.${user.id},auth_user_id.eq.${user.id}`)
    .maybeSingle();

  if (consultant?.office_id) {
    return {
      ok: true,
      data: {
        userId: user.id,
        officeId: consultant.office_id,
        role: "consultant",
        consultantId: consultant.id,
      },
    };
  }

  return { ok: false, error: "Perfil no encontrado." };
}

async function resolveClient(
  client: SupabaseClient,
  actor: Actor,
  input: ManualContractInput,
): Promise<Result<{ id: string }>> {
  if (input.clientId) {
    const { data, error } = await client
      .from("client")
      .select("id, office_id, name")
      .eq("id", input.clientId)
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        error: "Cliente no encontrado.",
        fieldErrors: { clientId: "Selecciona un cliente válido." },
      };
    }
    if (data.office_id && data.office_id !== actor.officeId) {
      return { ok: false, error: "No autorizado para este cliente." };
    }
    return { ok: true, data: { id: data.id as string } };
  }

  const { data: created, error } = await client
    .from("client")
    .insert({
      name: input.clientName.trim(),
      birth_date: input.birthDate || null,
      office_id: actor.officeId,
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error(error);
    return { ok: false, error: "No se pudo registrar el cliente." };
  }

  return { ok: true, data: { id: created.id as string } };
}

export async function createManualContract(
  client: SupabaseClient,
  input: ManualContractInput,
): Promise<Result<{ contract: Contract }>> {
  const actorResult = await resolveActor(client);
  if (!actorResult.ok) return actorResult;
  const actor = actorResult.data;

  const consultantId =
    actor.role === "consultant"
      ? actor.consultantId
      : input.consultantId || undefined;

  if (!consultantId) {
    return {
      ok: false,
      error: "Selecciona un asesor.",
      fieldErrors: { consultantId: "Selecciona un asesor." },
    };
  }

  const { data: consultant, error: consError } = await client
    .from("consultant")
    .select("id, office_id, status")
    .eq("id", consultantId)
    .maybeSingle();

  if (consError || !consultant || consultant.office_id !== actor.officeId) {
    return {
      ok: false,
      error: "Asesor no encontrado en esta promotoría.",
      fieldErrors: { consultantId: "Selecciona un asesor válido." },
    };
  }

  if (consultant.status === "INACTIVE") {
    return {
      ok: false,
      error: "No puedes registrar una póliza con un asesor inactivo.",
      fieldErrors: { consultantId: "El asesor está inactivo." },
    };
  }

  const { data: existingPoliza } = await client
    .from("contract")
    .select("id")
    .eq("office_id", actor.officeId)
    .eq("contract_number", input.contractNumber)
    .maybeSingle();

  if (existingPoliza) {
    return {
      ok: false,
      error: "Ya existe una póliza con ese número en la promotoría.",
      fieldErrors: { contractNumber: "Ese número de póliza ya está registrado." },
    };
  }

  const clientResult = await resolveClient(client, actor, input);
  if (!clientResult.ok) return clientResult;

  const { data: contract, error: contractError } = await client
    .from("contract")
    .insert({
      office_id: actor.officeId,
      consultant_id: consultantId,
      client_id: clientResult.data.id,
      contract_number: input.contractNumber,
      issue_date: input.issueDate,
      capture_date: input.issueDate,
      project_name: input.projectName,
      payment_method: input.paymentMethod,
      collection_day: input.collectionDay,
      status: "ACTIVE",
      source: "manual",
    })
    .select("*")
    .single();

  if (contractError || !contract) {
    console.error(contractError);
    return { ok: false, error: "No se pudo registrar la póliza." };
  }

  {
    const paidAt = input.lastPaymentDate;
    const year = Number.parseInt(paidAt.slice(0, 4), 10);
    const month = Number.parseInt(paidAt.slice(5, 7), 10);
    const paymentResult = await upsertCollectionPayment(client, {
      contractId: contract.id,
      year,
      month,
      paidAt,
      scheduledDay: input.collectionDay,
    });
    if (!paymentResult.ok) {
      return {
        ok: false,
        error:
          paymentResult.error ||
          "La póliza se creó, pero no se pudo registrar el último pago.",
      };
    }
  }

  await writeAuditLog(client, {
    officeId: actor.officeId,
    actorUserId: actor.userId,
    actorRole: actor.role,
    action: "contract.create",
    entityType: "contract",
    entityId: contract.id,
    source: "ui",
    newValues: {
      contract_number: input.contractNumber,
      consultant_id: consultantId,
      client_id: clientResult.data.id,
      source: "manual",
    },
  });

  return { ok: true, data: { contract: contract as Contract } };
}
