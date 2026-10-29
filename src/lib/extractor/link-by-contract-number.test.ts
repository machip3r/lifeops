/**
 * Register a póliza by hand, then import it (Mina de Oro / plantilla and commission HTML): the
 * import must find it by póliza number — written in any format — and update it, never create it
 * again. Runs the real import code against an in-memory database that enforces the same unique
 * index as Supabase (office_id, contract_number).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { normalizeClientName } from "@/lib/clients/name-match";
import { normalizeContractNumber } from "@/lib/contracts/contract-number";
import type { Db } from "@/lib/db";
import { importCommissionBatch } from "@/lib/extractor/import/import-contracts";
import { previewCommissionChanges } from "@/lib/extractor/import/preview-changes";
import type { IndexedRow } from "@/lib/extractor/import/columns";
import { applyRegistry, previewRegistry } from "@/lib/extractor/registry/import-registry";
import { parseRegistryFile } from "@/lib/extractor/registry/parse-file";
import type { RegistryRow } from "@/lib/extractor/registry/fields";
import type { Client, Consultant, Contract, ContractDetail } from "@/lib/supabase";
import { createManualContractSchema, registryImportBatchSchema, registryRowSchema } from "@/lib/validation/schemas";

const OFFICE = "00000000-0000-4000-8000-000000000001";
const USER = OFFICE;
const ACTOR = { userId: USER, officeId: OFFICE, role: "promotory" as const };

type Store = {
  consultants: Consultant[];
  clients: Client[];
  contracts: Contract[];
  details: ContractDetail[];
};

let seq = 0;
const id = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

/** The `db` methods the imports use, over plain arrays. */
function fakeDb(store: Store): Db {
  const withParties = (c: Contract) => ({
    ...c,
    client: store.clients.find((cl) => cl.id === c.client_id) ?? null,
    consultant: store.consultants.find((k) => k.id === c.consultant_id) ?? null,
  });
  const assertUnique = (officeId: string, number: string | null | undefined, selfId?: string) => {
    if (!number) return;
    if (store.contracts.some((c) => c.office_id === officeId && c.contract_number === number && c.id !== selfId)) {
      throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
    }
  };

  const db = {
    consultant: {
      getConsultantsByOffice: async (officeId: string) => store.consultants.filter((c) => c.office_id === officeId),
      findConsultantByCode: async (code: string, officeId: string) =>
        store.consultants.find(
          (c) => c.office_id === officeId && (c.consultant_code ?? "").toLowerCase() === code.trim().toLowerCase(),
        ) ?? null,
      getConsultantById: async (consultantId: string) => store.consultants.find((c) => c.id === consultantId) ?? null,
    },
    client: {
      findOrCreateClientsByName: async (names: string[], officeId?: string | null) => {
        const out = new Map<string, Client>();
        for (const raw of names) {
          const name = normalizeClientName(raw);
          if (!name) continue;
          let client = store.clients.find((c) => normalizeClientName(c.name) === name && c.office_id === officeId);
          if (!client) {
            client = { id: id(), name, office_id: officeId ?? null } as Client;
            store.clients.push(client);
          }
          out.set(name.toLowerCase(), client);
        }
        return out;
      },
      updateWithAudit: async (clientId: string, patch: Partial<Client>) => {
        const client = store.clients.find((c) => c.id === clientId)!;
        Object.assign(client, patch);
        return { ok: true as const, data: client };
      },
    },
    contract: {
      findWithPartiesByNumbers: async (numbers: string[], officeId: string) =>
        store.contracts
          .filter((c) => c.office_id === officeId && numbers.includes(c.contract_number ?? ""))
          .map(withParties),
      findByNumbers: async (numbers: string[], scope: { consultantId?: string }) =>
        store.contracts.filter(
          (c) =>
            numbers.includes(c.contract_number ?? "") &&
            (!scope.consultantId || c.consultant_id === scope.consultantId),
        ),
      createContracts: async (payloads: Array<Omit<Contract, "id" | "created_at" | "updated_at">>) => {
        for (const p of payloads) assertUnique(p.office_id as string, p.contract_number);
        const rows = payloads.map((p) => ({ ...p, id: id() }) as Contract);
        store.contracts.push(...rows);
        return rows;
      },
      updateWithAudit: async (contractId: string, patch: Partial<Contract>) => {
        const contract = store.contracts.find((c) => c.id === contractId);
        if (!contract) return { ok: false as const, error: "No encontramos la póliza." };
        assertUnique(contract.office_id as string, patch.contract_number, contract.id);
        Object.assign(contract, patch);
        return { ok: true as const, data: { ...contract } };
      },
      confirmInForce: async (ids: string[], asOf: string) => {
        let changed = 0;
        for (const c of store.contracts) {
          if (ids.includes(c.id) && c.status === "IN_FORCE" && (!c.in_force_as_of || c.in_force_as_of < asOf)) {
            c.in_force_as_of = asOf;
            changed += 1;
          }
        }
        return changed;
      },
    },
    contractDetail: {
      listByContracts: async (ids: string[]) => store.details.filter((d) => ids.includes(d.contract_id)),
      writeImportedDetails: async (
        byContract: Map<string, Array<Omit<ContractDetail, "id">>>,
        allowUpdate: (contractId: string, receipt: string) => boolean,
      ) => {
        const results = new Map<string, { inserted: unknown[]; updated: unknown[]; skipped: number; kept: number }>();
        for (const [contractId, records] of byContract) {
          const result = { inserted: [] as unknown[], updated: [] as unknown[], skipped: 0, kept: 0 };
          for (const record of records) {
            const stored = store.details.find(
              (d) => d.contract_id === contractId && d.receipt_number && d.receipt_number === record.receipt_number,
            );
            if (!stored) {
              store.details.push({ ...record, id: id() } as ContractDetail);
              result.inserted.push(record);
            } else if (stored.premium_payment === record.premium_payment) {
              result.skipped += 1;
            } else if (allowUpdate(contractId, record.receipt_number as string)) {
              Object.assign(stored, record);
              result.updated.push(record);
            } else {
              result.kept += 1;
            }
          }
          results.set(contractId, result);
        }
        return results;
      },
    },
    collections: {
      syncPaymentsFromImportedDetails: async (input: { items: Array<{ details: Array<{ payment_date: string | null }> }> }) =>
        input.items.reduce((n, item) => n + item.details.filter((d) => d.payment_date).length, 0),
    },
    auditLog: { write: async () => undefined },
  };
  return db as unknown as Db;
}

/** What «Registrar póliza» stores (same schema as the Server Action). */
function registerByHand(store: Store, input: { contractNumber: string; clientName: string; paymentMethod: string }) {
  const consultant = store.consultants[0];
  const parsed = createManualContractSchema.parse({
    consultantId: consultant.id,
    contractNumber: input.contractNumber,
    clientName: input.clientName,
    issueDate: "2025-03-15",
    projectName: "Imagina Ser 65",
    paymentMethod: input.paymentMethod,
    currency: "PESO",
    planClassification: "TRADICIONAL",
  });
  const client = { id: id(), name: normalizeClientName(parsed.clientName), office_id: OFFICE } as Client;
  store.clients.push(client);
  const contract = {
    id: id(),
    office_id: OFFICE,
    consultant_id: consultant.id,
    client_id: client.id,
    contract_number: parsed.contractNumber,
    issue_date: parsed.issueDate,
    project_name: parsed.projectName,
    payment_method: parsed.paymentMethod,
    currency: parsed.currency,
    plan_classification: parsed.planClassification,
    status: "IN_FORCE",
    source: "manual",
  } as unknown as Contract;
  store.contracts.push(contract);
  return contract;
}

let store: Store;
beforeEach(() => {
  seq = 0;
  store = {
    consultants: [
      { id: id(), office_id: OFFICE, name: "ANA ASESORA", consultant_code: "12345", status: "ACTIVE" } as Consultant,
    ],
    clients: [],
    contracts: [],
    details: [],
  };
});

describe("póliza number", () => {
  it("normalizes every format to one key", () => {
    for (const raw of ["vi-0001234", " VI-0001 234 ", "vi-0001,234", "VI-0001234"]) {
      expect(normalizeContractNumber(raw)).toBe("VI-0001234");
    }
  });

  it("manual registration stores the canonical number", () => {
    const contract = registerByHand(store, { contractNumber: "vi-0001 234", clientName: "Juan Pérez López", paymentMethod: "Mensual" });
    expect(contract.contract_number).toBe("VI-0001234");
  });
});

describe("register by hand → Mina de Oro / plantilla", () => {
  const row = (overrides: Partial<RegistryRow> = {}): RegistryRow =>
    registryRowSchema.parse({
      index: 2,
      contractNumber: "VI-0001234",
      clientName: "JUAN PEREZ LOPEZ",
      consultantCode: "12345",
      consultantName: "ANA ASESORA",
      issueDate: "2025-03-15",
      paymentMethod: "Anual",
      paymentChannel: "AGENTE",
      projectName: "Imagina Ser 65",
      lineCode: "LIFE",
      planClassification: null,
      insuredName: "JUAN PEREZ LOPEZ",
      status: "IN_FORCE",
      currency: "PESO",
      annualPremium: "4089.48",
      insuredAmount: "90000",
      annualPremiumMxn: 4089.48,
      insuredAmountMxn: 90000,
      deductibleMxn: null,
      endDate: null,
      collectionDay: null,
      clientEmail: null,
      clientPhone: null,
      clientBirthDate: null,
      clientMaritalStatus: null,
      clientRfc: null,
      clientCurp: null,
      ...overrides,
    }) as RegistryRow;

  it("finds the manual póliza, fills empty data and keeps differences unless picked", async () => {
    const manual = registerByHand(store, { contractNumber: "vi-0001 234", clientName: "Juan Pérez López", paymentMethod: "Mensual" });
    const db = fakeDb(store);

    const preview = await previewRegistry(db, { officeId: OFFICE, rows: [row()], asOf: "2026-10-01" });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0].kind).toBe("changed");
    expect(preview.items[0].diffs.map((d) => d.field)).toEqual(["paymentMethod"]);
    expect(preview.items[0].fills.map((d) => d.field)).toEqual(
      expect.arrayContaining(["paymentChannel", "lineCode", "insuredName", "annualPremium"]),
    );
    expect(preview.missingConsultants).toEqual([]);

    const kept = await applyRegistry(db, { officeId: OFFICE, actor: ACTOR, source: "mina_de_oro", rows: [row()], updates: {}, asOf: "2026-10-01" });
    expect(kept).toMatchObject({ created: 0, updated: 1, confirmed: 1, errors: [] });
    expect(store.contracts).toHaveLength(1);
    expect(store.contracts[0]).toMatchObject({
      id: manual.id,
      payment_method: "Mensual", // difference kept
      insured_name: "JUAN PEREZ LOPEZ", // filled
      currency: "PESO",
      source: "mixed",
      in_force_as_of: "2026-10-01",
    });

    const picked = await applyRegistry(db, {
      officeId: OFFICE,
      actor: ACTOR,
      source: "mina_de_oro",
      rows: [row()],
      updates: { "VI-0001234": ["paymentMethod"] },
      asOf: "2026-10-01",
    });
    expect(picked).toMatchObject({ created: 0, updated: 1, errors: [] });
    expect(store.contracts).toHaveLength(1);
    expect(store.contracts[0].payment_method).toBe("Anual");
  });

  it("links a number written in another format in the file", async () => {
    registerByHand(store, { contractNumber: "VI-0001234", clientName: "Juan Pérez López", paymentMethod: "Mensual" });
    const batch = registryImportBatchSchema.parse({
      source: "template",
      rows: [row({ contractNumber: "vi-0001 234" as string })],
      updates: { "vi-0001 234": ["paymentMethod"] },
      asOf: "2026-10-01",
    });
    expect(batch.rows[0].contractNumber).toBe("VI-0001234");
    expect(Object.keys(batch.updates ?? {})).toEqual(["VI-0001234"]);

    const result = await applyRegistry(fakeDb(store), {
      officeId: OFFICE,
      actor: ACTOR,
      source: batch.source,
      rows: batch.rows as RegistryRow[],
      updates: (batch.updates ?? {}) as Record<string, never>,
      asOf: batch.asOf ?? null,
    });
    expect(result.created).toBe(0);
    expect(store.contracts).toHaveLength(1);
    expect(store.contracts[0].payment_method).toBe("Anual");
  });
});

describe("register by hand → commission file (HTML)", () => {
  const HEADERS = [
    "CLIENTE", "POLIZA", "OFICINA", "MONEDA", "TIPO CAMBIO", "ASESOR", "TIPO POLIZA", "RECIBO", "FECHA EMISION",
    "FECHA VENCIMIENTO", "MOVIMIENTO", "FECHA PAGO", "PRIMA PAGO", "PRIMA COMISION", "FORMA DE PAGO",
    "COMISION/HONORARIOS", "% COMISION", "AJUSTE", "MOVIMIENTO 2", "PRIMA COBRO", "ANTIGÜEDAD", "PRIMA META",
  ];
  const line = (index: number, values: Record<string, string>): IndexedRow => ({
    index,
    cells: HEADERS.map((h) => values[h] ?? ""),
  });
  const receipt = (index: number, premium: string) =>
    line(index, {
      CLIENTE: "PEREZ LOPEZ JUAN",
      POLIZA: "vi-0001 234", // as the portal writes it: other case, a space
      MONEDA: "PESOS",
      ASESOR: "12345",
      RECIBO: "3/12",
      "FECHA EMISION": "15/03/2025",
      "FECHA PAGO": "20/05/2025",
      "PRIMA PAGO": premium,
      "FORMA DE PAGO": "1",
      "PRIMA COBRO": premium,
    });
  const meta = { fileIssueDate: "2025-06-01", fileName: "comisiones.html" };

  it("adds the receipts to the manual póliza instead of creating another", async () => {
    const manual = registerByHand(store, { contractNumber: "VI-0001234", clientName: "Juan Pérez López", paymentMethod: "Mensual" });
    const db = fakeDb(store);

    const changes = await previewCommissionChanges(db, { officeId: OFFICE, headers: HEADERS, rows: [receipt(0, "340.79")] });
    expect(changes).toHaveLength(1);
    expect(changes[0].contractNumber).toBe("VI-0001234");
    expect(changes[0].diffs.map((d) => d.field)).toContain("paymentMethod");

    const result = await importCommissionBatch({
      db,
      actorUserId: USER,
      officeId: OFFICE,
      commissionImportId: null,
      headers: HEADERS,
      rows: [receipt(0, "340.79")],
      importMeta: meta,
    });
    expect(result.errors).toEqual([]);
    expect(result.counts).toMatchObject({ contractsCreated: 0, contractsUpdated: 1, detailsInserted: 1 });
    expect(store.contracts).toHaveLength(1);
    expect(store.details).toHaveLength(1);
    expect(store.details[0]).toMatchObject({ contract_id: manual.id, receipt_number: "3/12", payment_date: "2025-05-20" });
    expect(store.contracts[0]).toMatchObject({ payment_method: "Mensual", source: "mixed" }); // difference kept

    // Same receipt with another amount: kept unless picked, then updated
    const again = await importCommissionBatch({
      db,
      actorUserId: USER,
      officeId: OFFICE,
      commissionImportId: null,
      headers: HEADERS,
      rows: [receipt(0, "400.00")],
      importMeta: meta,
      decisions: { "VI-0001234": ["receipt:3/12", "paymentMethod"] },
    });
    expect(again.counts).toMatchObject({ contractsCreated: 0, detailsUpdated: 1 });
    expect(store.details).toHaveLength(1);
    expect(store.details[0].premium_payment).toBe(400);
    expect(store.contracts).toHaveLength(1);
    expect(store.contracts[0].payment_method).toBe("Anual");
  });
});

describe("real Mina de Oro layout (Seguros Monterrey CSV, fictitious rows)", () => {
  // Title, report date, blank line and header exactly as the insurer exports them
  const HEADER =
    "No. Promotoría,Nombre del Promotor,Clave del Asesor ,Nombre del Asesor,Estatus,Nombre del Plan,Número de la Póliza,Fecha de emisión,Método de Pago ,Tipo de Seguro,Forma de Pago,Contratante,Persona Asegurada Principal,Próximo cumpleaños,Suma Asegurada (Convertido),Suma Asegurada,Prima Anual Emitido (Convertido),Prima Anual Emitido,Deducible (Convertido),Email de Preferencia,Teléfono de preferencia,Estado Civil ,Fecha de Nacimiento,Días para vencimiento,Fecha terminación de Contrato ,Clasificación del plan";
  const CSV = [
    "\uFEFFMina de Oro",
    "17/10/2026",
    ",".repeat(25),
    HEADER,
    "9999,Promotor Prueba,12345,ANA ASESORA,En Vigor,IMAGINA SER 65,VI0001111111,25-11-2025,CARGO AUTOMATICO A TARJ CRED,VIDA INDIVIDUAL,MENSUAL,JUAN PEREZ LOPEZ,JUAN PEREZ LOPEZ,03/03,797095.71,90000,36218.97,4089.48,,juan@example.com,,Soltero,03/03/1997,13188,25-11-2062,FLEXIBLE",
    "9999,Promotor Prueba,12345,ANA ASESORA,Anulada,INTEGRO,GM0000222222,08-07-2024,AGENTE,GASTOS MEDICOS INDIVIDUAL,ANUAL,MARIA LOPEZ RUIZ,MARIA LOPEZ RUIZ,09/04,170000000,170000000,4711.87,4711.87,1000000,,,Soltero,09/04/1990,264,08-07-2025,GMM",
    "9999,Promotor Prueba,12345,ANA ASESORA,En Vigor sin Pago de Primas,VIDA MUJER,VI0003333333,26-04-2015,AGENTE,VIDA INDIVIDUAL,SEMESTRAL,ROSA DIAZ GIL,ROSA DIAZ GIL,03/02,398547.86,45000,24999.58,2822.7,,,,Casado,03/02/1980,900,26-04-2040,TRADICIONAL",
    "9999,Promotor Prueba,12345,ANA ASESORA,Vigor Prorrogado,ORVI 99,VI0004444444,10-01-2010,AGENTE,VIDA INDIVIDUAL,TRIMESTRAL,LUIS SOTO MEJIA,LUIS SOTO MEJIA,10/01,500000,500000,12000,12000,,,,Casado,10/01/1975,700,10-01-2030,TRADICIONAL",
  ].join("\r\n");

  it("reads the insurer layout: cut-off, four estatus and 12-character numbers", async () => {
    const parsed = await parseRegistryFile(new File([CSV], "Mina de Oro.csv", { type: "text/csv" }), "mina_de_oro");
    expect(parsed.errors).toEqual([]);
    expect(parsed.reportDate).toBe("2026-10-17");
    expect(parsed.agencyCodes).toEqual(["9999"]);
    expect(parsed.rows.map((r) => [r.contractNumber, r.status])).toEqual([
      ["VI0001111111", "IN_FORCE"],
      ["GM0000222222", "ANNULLED"],
      ["VI0003333333", "NO_PREMIUMS"],
      ["VI0004444444", "EXTENDED"],
    ]);
    for (const r of parsed.rows) expect(registryRowSchema.safeParse(r).success).toBe(true);
  });

  it("manual póliza + Mina de Oro + commission HTML end up as one póliza", async () => {
    const manual = registerByHand(store, { contractNumber: "vi0001111111", clientName: "Juan Pérez López", paymentMethod: "Mensual" });
    const db = fakeDb(store);
    const parsed = await parseRegistryFile(new File([CSV], "Mina de Oro.csv", { type: "text/csv" }), "mina_de_oro");

    const preview = await previewRegistry(db, { officeId: OFFICE, rows: parsed.rows, asOf: parsed.reportDate });
    expect(preview.items.filter((i) => i.kind === "new").map((i) => i.contractNumber)).toEqual([
      "GM0000222222",
      "VI0003333333",
      "VI0004444444",
    ]);
    expect(preview.items.find((i) => i.contractNumber === "VI0001111111")?.kind).not.toBe("new");

    const result = await applyRegistry(db, {
      officeId: OFFICE,
      actor: ACTOR,
      source: "mina_de_oro",
      rows: parsed.rows,
      updates: {},
      asOf: parsed.reportDate,
    });
    expect(result).toMatchObject({ created: 3, updated: 1, errors: [] });
    expect(store.contracts).toHaveLength(4);
    const linked = store.contracts.find((c) => c.id === manual.id)!;
    expect(linked).toMatchObject({ contract_number: "VI0001111111", in_force_as_of: "2026-10-17", source: "mixed" });
    // Only pólizas en vigor carry the insurer date
    expect(store.contracts.filter((c) => c.in_force_as_of).map((c) => c.contract_number)).toEqual(["VI0001111111"]);

    // Commission HTML (same number format as the portal) adds receipts to that same póliza
    const headers = ["CLIENTE", "POLIZA", "MONEDA", "ASESOR", "RECIBO", "FECHA EMISION", "FECHA PAGO", "PRIMA PAGO", "FORMA DE PAGO"];
    const cells = ["JUAN PEREZ LOPEZ", "VI0001111111", "UDI", "12345", "11/12", "25/11/2025", "20/10/2026", "340.79", "5"];
    const imported = await importCommissionBatch({
      db,
      actorUserId: USER,
      officeId: OFFICE,
      commissionImportId: null,
      headers,
      rows: [{ index: 0, cells }],
      importMeta: { fileIssueDate: "2026-10-20", fileName: "comisiones.html" },
    });
    expect(imported.errors).toEqual([]);
    expect(imported.counts).toMatchObject({ contractsCreated: 0, contractsUpdated: 1, detailsInserted: 1 });
    expect(store.contracts).toHaveLength(4);
    expect(store.details[0].contract_id).toBe(manual.id);
  });
});
