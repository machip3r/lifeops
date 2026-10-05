import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectionAction,
  mapCollectionSource,
  writeAuditLog,
} from "@/lib/audit/write";
import type {
  CollectionAuditActionType,
  CollectionPaymentSource,
  CollectionStatus,
  ContractCollectionPayment,
} from "@/lib/supabase";
import { chunkArray, IMPORT_BATCH_SIZE } from "@/lib/extractor/batch";
import { POLICY_AT_RISK_DAYS } from "@/lib/collections/constants";
import {
  emptyPageResult,
  normalizePageParams,
  toRange,
  type PageParams,
  type PageResult,
} from "@/lib/pagination";

type CollectionsActor = {
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
  evidenceFileId: string | null;
  evidenceDisplayName: string | null;
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
    actorRole?: "office" | "promotory" | "consultant";
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
  await writeAuditLog(client, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? null,
    action: collectionAction(input.actionType),
    entityType: input.contractId ? "contract" : "office",
    entityId: input.contractId ?? null,
    source: mapCollectionSource(input.source),
    oldValues: { ...(input.oldValues ?? {}), ...contractMeta },
    newValues: { ...(input.newValues ?? {}), ...contractMeta },
  });
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
    evidenceFileId: null,
    evidenceDisplayName: null,
  }));
}

async function seedCollectionPaymentsForYear(
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
  pageParams?: Partial<PageParams>,
): Promise<ActionResult<PageResult<CollectionsGridRow>>> {
  const actor = await resolveActor(client);
  if (!actor.ok) return actor;

  await seedCollectionPaymentsForYear(client, year);

  const { page, pageSize } = normalizePageParams(pageParams);
  const { from, to } = toRange(page, pageSize);

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
      { count: "exact" },
    )
    .eq("status", "ACTIVE")
    .order("contract_number", { ascending: true, nullsFirst: false })
    .range(from, to);

  if (actor.data.role === "consultant" && actor.data.consultantId) {
    contractsQuery = contractsQuery.eq(
      "consultant_id",
      actor.data.consultantId,
    );
  }

  const {
    data: contracts,
    error: contractsError,
    count,
  } = await contractsQuery;
  if (contractsError) {
    console.error(contractsError);
    return { ok: false, error: "No se pudieron cargar los contratos." };
  }

  const list = contracts ?? [];
  const total = count ?? 0;
  const contractIds = list.map((c) => c.id as string);
  if (contractIds.length === 0) {
    return {
      ok: true,
      data: emptyPageResult<CollectionsGridRow>({ page, pageSize }),
    };
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

  const paymentIds = ((payments ?? []) as ContractCollectionPayment[])
    .map((p) => p.id)
    .filter(Boolean);
  const evidenceByPaymentId = new Map<
    string,
    { id: string; display_name: string }
  >();
  if (paymentIds.length > 0) {
    const { data: evidenceFiles, error: evidenceError } = await client
      .from("file")
      .select("id, display_name, collection_payment_id")
      .in("collection_payment_id", paymentIds)
      .eq("status", "ACTIVE");

    if (evidenceError) {
      console.error(evidenceError);
    } else {
      for (const f of evidenceFiles ?? []) {
        const paymentId = f.collection_payment_id as string | null;
        if (!paymentId || evidenceByPaymentId.has(paymentId)) continue;
        evidenceByPaymentId.set(paymentId, {
          id: f.id as string,
          display_name: (f.display_name as string) || "Evidencia",
        });
      }
    }
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
      const evidence = evidenceByPaymentId.get(p.id) ?? null;
      months[idx] = {
        month: p.month,
        scheduledDay: p.scheduled_day ?? null,
        paidAt: p.paid_at ?? null,
        amount: p.amount != null ? Number(p.amount) : null,
        notes: p.notes ?? null,
        source: p.source ?? null,
        paymentId: p.id,
        evidenceFileId: evidence?.id ?? null,
        evidenceDisplayName: evidence?.display_name ?? null,
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

  return {
    ok: true,
    data: { rows, total, page, pageSize },
  };
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
    actorRole: actor.data.role,
    actionType: "status_change",
    source: "manual",
    oldValues: { collection_status: existing.collection_status },
    newValues: { collection_status: status },
  });

  return { ok: true, data: { collectionStatus: status } };
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
    actorRole: actor.data.role,
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
    actorRole: actor.data.role,
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
    actorRole: actor.data.role,
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
    actorRole: actor.data.role,
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

type ImportPaymentDetail = {
  payment_date?: string | null;
  collection_premium?: number | null;
};

/** Batch cobranza sync for many contracts (few selects + chunked upserts). */
export async function syncPaymentsFromImportedDetailsBatch(
  client: SupabaseClient,
  input: {
    officeId: string;
    actorUserId: string | null;
    items: Array<{
      contractId: string;
      details: ImportPaymentDetail[];
    }>;
  },
): Promise<number> {
  type Candidate = {
    contract_id: string;
    year: number;
    month: number;
    scheduled_day: number;
    paid_at: string;
    amount: number | null;
  };

  const byContractYm = new Map<string, Candidate>();
  const collectionDayHint = new Map<string, number>();

  for (const item of input.items) {
    for (const detail of item.details) {
      if (!detail.payment_date) continue;
      const paidAt = detail.payment_date;
      const year = Number.parseInt(paidAt.slice(0, 4), 10);
      const month = Number.parseInt(paidAt.slice(5, 7), 10);
      const day = Number.parseInt(paidAt.slice(8, 10), 10);
      if (!year || !month || !day) continue;
      const key = `${item.contractId}|${year}|${month}`;
      byContractYm.set(key, {
        contract_id: item.contractId,
        year,
        month,
        scheduled_day: day,
        paid_at: paidAt,
        amount: detail.collection_premium ?? null,
      });
      if (!collectionDayHint.has(item.contractId)) {
        collectionDayHint.set(item.contractId, day);
      }
    }
  }

  if (byContractYm.size === 0) return 0;

  const contractIds = [
    ...new Set([...byContractYm.values()].map((c) => c.contract_id)),
  ];

  const skipManual = new Set<string>();
  for (const idChunk of chunkArray(contractIds, IMPORT_BATCH_SIZE)) {
    const { data: existingRows, error: existingError } = await client
      .from("contract_collection_payment")
      .select("contract_id, source, paid_at, year, month")
      .in("contract_id", idChunk);
    if (existingError) throw existingError;
    for (const row of existingRows || []) {
      if (row.source === "manual" && row.paid_at) {
        skipManual.add(`${row.contract_id}|${row.year}|${row.month}`);
      }
    }
  }

  const toUpsert = [...byContractYm.entries()]
    .filter(([key]) => !skipManual.has(key))
    .map(([, c]) => ({
      contract_id: c.contract_id,
      year: c.year,
      month: c.month,
      scheduled_day: c.scheduled_day,
      paid_at: c.paid_at,
      amount: c.amount,
      source: "import" as const,
      updated_by: input.actorUserId,
      created_by: input.actorUserId,
    }));

  let upserted = 0;
  for (const chunk of chunkArray(toUpsert, IMPORT_BATCH_SIZE)) {
    const { error } = await client.from("contract_collection_payment").upsert(chunk, {
      onConflict: "contract_id,year,month",
    });
    if (error) throw error;
    upserted += chunk.length;
  }

  // Set collection_day only where still null (chunked updates)
  const hintIds = [...collectionDayHint.keys()];
  for (const idChunk of chunkArray(hintIds, IMPORT_BATCH_SIZE)) {
    const { data: contracts } = await client
      .from("contract")
      .select("id, collection_day")
      .in("id", idChunk)
      .is("collection_day", null);
    const updates = (contracts || [])
      .map((contract) => {
        const day = collectionDayHint.get(contract.id);
        return day == null ? null : { id: contract.id, collection_day: day };
      })
      .filter((u): u is { id: string; collection_day: number } => u != null);

    await Promise.all(
      updates.map((u) =>
        client
          .from("contract")
          .update({ collection_day: u.collection_day })
          .eq("id", u.id),
      ),
    );
  }

  return upserted;
}

/**
 * For first-time policies in an import: record the last payment before this
 * commission file (per póliza) so cobranza can predict next dues and risk.
 */
export async function seedPriorPaymentsForNewContracts(
  client: SupabaseClient,
  input: {
    officeId: string;
    actorUserId: string | null;
    /** contract_id → ISO date (YYYY-MM-DD) of last payment before this file */
    priorByContractId: Record<string, string>;
    commissionImportId?: string | null;
  },
): Promise<number> {
  const entries = Object.entries(input.priorByContractId).filter(([, paidAt]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(paidAt.trim()),
  );
  if (entries.length === 0) return 0;

  const rows = entries.map(([contractId, paidAtRaw]) => {
    const paidAt = paidAtRaw.trim();
    const year = Number.parseInt(paidAt.slice(0, 4), 10);
    const month = Number.parseInt(paidAt.slice(5, 7), 10);
    const day = Number.parseInt(paidAt.slice(8, 10), 10);
    return {
      contract_id: contractId,
      year,
      month,
      scheduled_day: day,
      paid_at: paidAt,
      amount: null as number | null,
      notes: "Último pago previo al archivo de comisiones (alta inicial)",
      source: "import" as const,
      commission_import_id: input.commissionImportId ?? null,
      updated_by: input.actorUserId,
      created_by: input.actorUserId,
    };
  });

  let upserted = 0;
  for (const chunk of chunkArray(rows, IMPORT_BATCH_SIZE)) {
    const { error } = await client.from("contract_collection_payment").upsert(chunk, {
      onConflict: "contract_id,year,month",
    });
    if (error) throw error;
    upserted += chunk.length;
  }

  for (const chunk of chunkArray(entries, IMPORT_BATCH_SIZE)) {
    const ids = chunk.map(([id]) => id);
    const { data: contracts } = await client
      .from("contract")
      .select("id, collection_day, collection_status")
      .in("id", ids);

    const paidById = new Map(chunk);
    for (const contract of contracts || []) {
      const paidAt = paidById.get(contract.id)?.trim();
      if (!paidAt) continue;
      const day = Number.parseInt(paidAt.slice(8, 10), 10);
      const updates: Record<string, unknown> = {};
      if (contract.collection_day == null && Number.isFinite(day)) {
        updates.collection_day = day;
      }
      const prior = new Date(`${paidAt}T12:00:00`);
      const today = new Date();
      const daysSince =
        Math.floor((today.getTime() - prior.getTime()) / (1000 * 60 * 60 * 24));
      if (daysSince > POLICY_AT_RISK_DAYS && contract.collection_status == null) {
        updates.collection_status = "ATRASADO";
      } else if (contract.collection_status == null) {
        updates.collection_status = "CORRIENTE";
      }
      if (Object.keys(updates).length > 0) {
        await client.from("contract").update(updates).eq("id", contract.id);
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
    actorRole?: "office" | "promotory" | "consultant" | "system";
    contractsTouched: number;
    paymentsUpserted: number;
    detailsInserted: number;
  },
): Promise<void> {
  await writeAuditLog(client, {
    officeId: input.officeId,
    actorUserId: input.actorUserId,
    actorRole: input.actorRole ?? "office",
    action: collectionAction("import_sync"),
    entityType: "office",
    entityId: null,
    source: "import",
    oldValues: {},
    newValues: {
      contracts_touched: input.contractsTouched,
      payments_upserted: input.paymentsUpserted,
      details_inserted: input.detailsInserted,
    },
  });
}
