import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  CollectionAuditActionType,
  CollectionAuditLog,
  CollectionPaymentSource,
  CollectionStatus,
  ContractCollectionPayment,
} from "@/lib/supabase";

export type CollectionsActor = {
  userId: string;
  officeId: string;
  role: "promotory" | "consultant";
  consultantId?: string;
};

export type CollectionMonthCell = {
  month: number;
  scheduledDay: number | null;
  paidAt: string | null;
  amount: number | null;
  notes: string | null;
  source: CollectionPaymentSource | null;
  paymentId: string | null;
};

export type CollectionsGridRow = {
  contractId: string;
  consultantId: string | null;
  consultantCode: string | null;
  consultantName: string | null;
  contractNumber: string | null;
  clientName: string | null;
  projectName: string | null;
  currency: string | null;
  paymentMethod: string | null;
  paymentChannel: string | null;
  collectionPremium: number | null;
  collectionDay: number | null;
  collectionStatus: CollectionStatus | null;
  months: CollectionMonthCell[];
};

export type CollectionAuditLogEntry = CollectionAuditLog & {
  contractNumber?: string | null;
};

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

async function resolveActor(
  client: SupabaseClient,
): Promise<ActionResult<CollectionsActor>> {
  // With a Bearer-scoped client, getUser() uses the Authorization header / session.
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

async function writeAudit(
  client: SupabaseClient,
  input: {
    officeId: string;
    contractId?: string | null;
    actorUserId: string;
    actionType: CollectionAuditActionType;
    source: CollectionPaymentSource;
    oldValues?: Record<string, unknown>;
    newValues?: Record<string, unknown>;
  },
): Promise<void> {
  let contractNumber: string | null = null;
  if (input.contractId) {
    const { data: contract } = await client
      .from("contract")
      .select("contract_number")
      .eq("id", input.contractId)
      .maybeSingle();
    contractNumber = (contract?.contract_number as string | null) ?? null;
  }

  const contractMeta = contractNumber ? { contract_number: contractNumber } : {};
  const { error } = await client.from("collection_audit_log").insert({
    office_id: input.officeId,
    contract_id: input.contractId ?? null,
    actor_user_id: input.actorUserId,
    action_type: input.actionType,
    source: input.source,
    old_values: { ...(input.oldValues ?? {}), ...contractMeta },
    new_values: { ...(input.newValues ?? {}), ...contractMeta },
  });
  if (error) {
    console.error("collection_audit_log insert failed", error);
  }
}

function emptyMonths(): CollectionMonthCell[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    scheduledDay: null,
    paidAt: null,
    amount: null,
    notes: null,
    source: null,
    paymentId: null,
  }));
}

export async function seedCollectionPaymentsForYear(
  client: SupabaseClient,
  year: number,
): Promise<number> {
  const { data, error } = await client.rpc(
    "seed_collection_payments_from_details",
    { year_param: year },
  );
  if (error) {
    console.error("seed_collection_payments_from_details failed", error);
    return 0;
  }
  return typeof data === "number" ? data : 0;
}

export async function getCollectionsGrid(
  client: SupabaseClient,
  year: number,
): Promise<ActionResult<CollectionsGridRow[]>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  await seedCollectionPaymentsForYear(client, year);

  let contractsQuery = client
    .from("contract")
    .select(
      `
      id,
      contract_number,
      project_name,
      currency,
      payment_method,
      payment_channel,
      collection_day,
      collection_status,
      status,
      consultant:consultant_id ( id, name, consultant_code, office_id ),
      client:client_id ( name )
    `,
    )
    .eq("status", "ACTIVE")
    .order("contract_number", { ascending: true, nullsFirst: false });

  if (actor.data.role === "consultant" && actor.data.consultantId) {
    contractsQuery = contractsQuery.eq(
      "consultant_id",
      actor.data.consultantId,
    );
  }

  const { data: contracts, error: contractsError } = await contractsQuery;
  if (contractsError) {
    console.error(contractsError);
    return { ok: false, error: "No se pudieron cargar los contratos." };
  }

  const list = contracts ?? [];
  const contractIds = list.map((c) => c.id as string);
  if (contractIds.length === 0) {
    return { ok: true, data: [] };
  }

  const { data: payments, error: paymentsError } = await client
    .from("contract_collection_payment")
    .select("*")
    .eq("year", year)
    .in("contract_id", contractIds);

  if (paymentsError) {
    console.error(paymentsError);
    return { ok: false, error: "No se pudieron cargar los pagos de cobranza." };
  }

  const { data: details, error: detailsError } = await client
    .from("contract_detail")
    .select("contract_id, collection_premium, payment_date, payment_method")
    .in("contract_id", contractIds)
    .order("payment_date", { ascending: false, nullsFirst: false });

  if (detailsError) {
    console.error(detailsError);
    return { ok: false, error: "No se pudieron cargar valores de prima." };
  }

  const latestPremium = new Map<string, number | null>();
  const latestPaymentMethod = new Map<string, string | null>();
  for (const d of details ?? []) {
    const cid = d.contract_id as string;
    if (!latestPremium.has(cid)) {
      latestPremium.set(
        cid,
        d.collection_premium != null ? Number(d.collection_premium) : null,
      );
    }
    if (!latestPaymentMethod.has(cid) && d.payment_method) {
      latestPaymentMethod.set(cid, d.payment_method as string);
    }
  }

  const paymentsByContract = new Map<string, ContractCollectionPayment[]>();
  for (const p of (payments ?? []) as ContractCollectionPayment[]) {
    const arr = paymentsByContract.get(p.contract_id) ?? [];
    arr.push(p);
    paymentsByContract.set(p.contract_id, arr);
  }

  const rows: CollectionsGridRow[] = list.map((c) => {
    const consultant = Array.isArray(c.consultant)
      ? c.consultant[0]
      : c.consultant;
    const clientRow = Array.isArray(c.client) ? c.client[0] : c.client;
    const months = emptyMonths();
    for (const p of paymentsByContract.get(c.id as string) ?? []) {
      const idx = p.month - 1;
      if (idx < 0 || idx > 11) continue;
      months[idx] = {
        month: p.month,
        scheduledDay: p.scheduled_day ?? null,
        paidAt: p.paid_at ?? null,
        amount: p.amount != null ? Number(p.amount) : null,
        notes: p.notes ?? null,
        source: p.source ?? null,
        paymentId: p.id,
      };
    }

    return {
      contractId: c.id as string,
      consultantId: (consultant?.id as string | null) ?? null,
      consultantCode: (consultant?.consultant_code as string | null) ?? null,
      consultantName: (consultant?.name as string | null) ?? null,
      contractNumber: (c.contract_number as string | null) ?? null,
      clientName: (clientRow?.name as string | null) ?? null,
      projectName: (c.project_name as string | null) ?? null,
      currency: (c.currency as string | null) ?? null,
      paymentMethod:
        (c.payment_method as string | null) ??
        latestPaymentMethod.get(c.id as string) ??
        null,
      paymentChannel: (c.payment_channel as string | null) ?? null,
      collectionPremium: latestPremium.get(c.id as string) ?? null,
      collectionDay:
        c.collection_day != null ? Number(c.collection_day) : null,
      collectionStatus: (c.collection_status as CollectionStatus | null) ?? null,
      months,
    };
  });

  return { ok: true, data: rows };
}

export async function updateCollectionStatus(
  client: SupabaseClient,
  contractId: string,
  status: CollectionStatus,
): Promise<ActionResult<{ collectionStatus: CollectionStatus }>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing, error: loadError } = await client
    .from("contract")
    .select("id, collection_status")
    .eq("id", contractId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const { error } = await client
    .from("contract")
    .update({ collection_status: status })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo actualizar el estatus." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId,
    actorUserId: actor.data.userId,
    actionType: "status_change",
    source: "manual",
    oldValues: { collection_status: existing.collection_status },
    newValues: { collection_status: status },
  });

  return { ok: true, data: { collectionStatus: status } };
}

export async function updateCollectionDay(
  client: SupabaseClient,
  contractId: string,
  collectionDay: number | null,
): Promise<ActionResult<{ collectionDay: number | null }>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing, error: loadError } = await client
    .from("contract")
    .select("id, collection_day")
    .eq("id", contractId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const { error } = await client
    .from("contract")
    .update({ collection_day: collectionDay })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo actualizar el día de cobro." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId,
    actorUserId: actor.data.userId,
    actionType: "collection_day_change",
    source: "manual",
    oldValues: { collection_day: existing.collection_day },
    newValues: { collection_day: collectionDay },
  });

  return { ok: true, data: { collectionDay } };
}

export async function updatePaymentChannel(
  client: SupabaseClient,
  contractId: string,
  paymentChannel: string | null,
): Promise<ActionResult<{ paymentChannel: string | null }>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing, error: loadError } = await client
    .from("contract")
    .select("id, payment_channel")
    .eq("id", contractId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const { error } = await client
    .from("contract")
    .update({ payment_channel: paymentChannel })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo actualizar el medio de cobro." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId,
    actorUserId: actor.data.userId,
    actionType: "payment_channel_change",
    source: "manual",
    oldValues: { payment_channel: existing.payment_channel },
    newValues: { payment_channel: paymentChannel },
  });

  return { ok: true, data: { paymentChannel } };
}

export async function updateProjectName(
  client: SupabaseClient,
  contractId: string,
  projectName: string | null,
): Promise<ActionResult<{ projectName: string | null }>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing, error: loadError } = await client
    .from("contract")
    .select("id, project_name")
    .eq("id", contractId)
    .maybeSingle();

  if (loadError || !existing) {
    return { ok: false, error: "Contrato no encontrado." };
  }

  const { error } = await client
    .from("contract")
    .update({ project_name: projectName })
    .eq("id", contractId);

  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo actualizar el nombre del proyecto." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId,
    actorUserId: actor.data.userId,
    actionType: "project_name_change",
    source: "manual",
    oldValues: { project_name: existing.project_name },
    newValues: { project_name: projectName },
  });

  return { ok: true, data: { projectName } };
}

export async function upsertCollectionPayment(
  client: SupabaseClient,
  input: {
    contractId: string;
    year: number;
    month: number;
    paidAt: string;
    scheduledDay?: number | null;
    amount?: number | null;
    notes?: string | null;
  },
): Promise<ActionResult<ContractCollectionPayment>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing } = await client
    .from("contract_collection_payment")
    .select("*")
    .eq("contract_id", input.contractId)
    .eq("year", input.year)
    .eq("month", input.month)
    .maybeSingle();

  const scheduledDay =
    input.scheduledDay ??
    (existing?.scheduled_day as number | null | undefined) ??
    Number.parseInt(input.paidAt.slice(8, 10), 10);

  const payload = {
    contract_id: input.contractId,
    year: input.year,
    month: input.month,
    scheduled_day: scheduledDay,
    paid_at: input.paidAt,
    amount: input.amount ?? null,
    notes: input.notes ?? null,
    source: "manual" as const,
    updated_by: actor.data.userId,
    created_by: existing?.created_by ?? actor.data.userId,
  };

  const { data, error } = await client
    .from("contract_collection_payment")
    .upsert(payload, { onConflict: "contract_id,year,month" })
    .select("*")
    .single();

  if (error || !data) {
    console.error(error);
    return { ok: false, error: "No se pudo registrar el pago." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId: input.contractId,
    actorUserId: actor.data.userId,
    actionType: "payment_upsert",
    source: "manual",
    oldValues: existing
      ? {
          year: existing.year,
          month: existing.month,
          paid_at: existing.paid_at,
          scheduled_day: existing.scheduled_day,
          amount: existing.amount,
        }
      : {},
    newValues: {
      year: input.year,
      month: input.month,
      paid_at: input.paidAt,
      scheduled_day: scheduledDay,
      amount: input.amount ?? null,
    },
  });

  // Keep contract.collection_day in sync when empty
  const { data: contract } = await client
    .from("contract")
    .select("collection_day")
    .eq("id", input.contractId)
    .maybeSingle();

  if (contract && contract.collection_day == null && scheduledDay != null) {
    await client
      .from("contract")
      .update({ collection_day: scheduledDay })
      .eq("id", input.contractId);
  }

  return { ok: true, data: data as ContractCollectionPayment };
}

export async function clearCollectionPayment(
  client: SupabaseClient,
  input: { contractId: string; year: number; month: number },
): Promise<ActionResult<{ cleared: true }>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  const { data: existing } = await client
    .from("contract_collection_payment")
    .select("*")
    .eq("contract_id", input.contractId)
    .eq("year", input.year)
    .eq("month", input.month)
    .maybeSingle();

  if (!existing) {
    return { ok: false, error: "No hay pago registrado para ese mes." };
  }

  const { error } = await client
    .from("contract_collection_payment")
    .update({
      paid_at: null,
      amount: null,
      source: "manual",
      updated_by: actor.data.userId,
    })
    .eq("id", existing.id);

  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo quitar el pago." };
  }

  await writeAudit(client, {
    officeId: actor.data.officeId,
    contractId: input.contractId,
    actorUserId: actor.data.userId,
    actionType: "payment_clear",
    source: "manual",
    oldValues: {
      year: existing.year,
      month: existing.month,
      paid_at: existing.paid_at,
      scheduled_day: existing.scheduled_day,
      amount: existing.amount,
    },
    newValues: {
      year: input.year,
      month: input.month,
      paid_at: null,
    },
  });

  return { ok: true, data: { cleared: true } };
}

export async function getCollectionAuditLog(
  client: SupabaseClient,
  filters: { contractId?: string | null; limit?: number },
): Promise<ActionResult<CollectionAuditLogEntry[]>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  let query = client
    .from("collection_audit_log")
    .select(
      `
      *,
      contract:contract_id ( contract_number )
    `,
    )
    .eq("office_id", actor.data.officeId)
    .order("created_at", { ascending: false })
    .limit(filters.limit ?? 50);

  if (filters.contractId) {
    query = query.eq("contract_id", filters.contractId);
  }

  const { data, error } = await query;
  if (error) {
    console.error(error);
    return { ok: false, error: "No se pudo cargar el historial." };
  }

  const entries: CollectionAuditLogEntry[] = (data ?? []).map((row) => {
    const record = row as CollectionAuditLog & {
      contract?: { contract_number?: string | null } | { contract_number?: string | null }[] | null;
    };
    const { contract, ...rest } = record;
    const contractRel = Array.isArray(contract) ? contract[0] : contract;
    const fromJoin = contractRel?.contract_number ?? null;
    const fromValues =
      (rest.new_values?.contract_number as string | null | undefined) ?? null;
    return {
      ...rest,
      contractNumber: fromJoin || fromValues || null,
    };
  });

  return { ok: true, data: entries };
}

/** Used by HTML import: upsert import payments and write import_sync audit. */
export async function syncPaymentsFromImportedDetails(
  client: SupabaseClient,
  input: {
    officeId: string;
    actorUserId: string | null;
    contractId: string;
    details: Array<{
      payment_date?: string | null;
      collection_premium?: number | null;
    }>;
  },
): Promise<number> {
  let upserted = 0;
  const paymentSummaries: Array<Record<string, unknown>> = [];

  for (const detail of input.details) {
    if (!detail.payment_date) continue;
    const paidAt = detail.payment_date;
    const year = Number.parseInt(paidAt.slice(0, 4), 10);
    const month = Number.parseInt(paidAt.slice(5, 7), 10);
    const day = Number.parseInt(paidAt.slice(8, 10), 10);
    if (!year || !month || !day) continue;

    const { data: existing } = await client
      .from("contract_collection_payment")
      .select("id, source, paid_at")
      .eq("contract_id", input.contractId)
      .eq("year", year)
      .eq("month", month)
      .maybeSingle();

    if (existing?.source === "manual" && existing.paid_at) {
      continue;
    }

    const { error } = await client.from("contract_collection_payment").upsert(
      {
        contract_id: input.contractId,
        year,
        month,
        scheduled_day: day,
        paid_at: paidAt,
        amount: detail.collection_premium ?? null,
        source: "import",
        updated_by: input.actorUserId,
        created_by: input.actorUserId,
      },
      { onConflict: "contract_id,year,month" },
    );

    if (!error) {
      upserted += 1;
      paymentSummaries.push({ year, month, paid_at: paidAt, day });
    }
  }

  if (upserted > 0) {
    const { data: contract } = await client
      .from("contract")
      .select("collection_day")
      .eq("id", input.contractId)
      .maybeSingle();

    if (contract && contract.collection_day == null) {
      const first = paymentSummaries[0];
      if (first?.day != null) {
        await client
          .from("contract")
          .update({ collection_day: first.day })
          .eq("id", input.contractId);
      }
    }
  }

  return upserted;
}

export async function writeImportSyncAudit(
  client: SupabaseClient,
  input: {
    officeId: string;
    actorUserId: string | null;
    contractsTouched: number;
    paymentsUpserted: number;
    detailsInserted: number;
  },
): Promise<void> {
  await client.from("collection_audit_log").insert({
    office_id: input.officeId,
    contract_id: null,
    actor_user_id: input.actorUserId,
    action_type: "import_sync",
    source: "import",
    old_values: {},
    new_values: {
      contracts_touched: input.contractsTouched,
      payments_upserted: input.paymentsUpserted,
      details_inserted: input.detailsInserted,
    },
  });
}

export { resolveActor, writeAudit };
