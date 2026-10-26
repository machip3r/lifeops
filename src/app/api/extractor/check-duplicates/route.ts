import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  requireOfficeContext,
} from "@/lib/auth/api";
import {
  findContractsByNumbers,
  listDetailKeysForContractsAdmin,
} from "@/lib/db-admin";
import { IMPORT_BATCH_SIZE } from "@/lib/extractor/batch";
import { normalizeReceiptNumber } from "@/lib/extractor/receipt";
import {
  contractNumberSchema,
  LIMITS,
} from "@/lib/validation/schemas";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  /** Accept raw strings; validate each entry so one bad póliza does not blank the import. */
  contractNumbers: z.array(z.coerce.string()).max(IMPORT_BATCH_SIZE),
  /** Optional detail checks: contract_number + RECIBO (fallback: payment_date + premium) */
  details: z
    .array(
      z.object({
        contractNumber: z.coerce.string().min(1).max(LIMITS.contractNumber),
        receiptNumber: z
          .union([z.string().max(128), z.null(), z.undefined()])
          .optional()
          .transform((v) => normalizeReceiptNumber(v)),
        paymentDate: z
          .union([z.string(), z.null(), z.undefined()])
          .optional()
          .transform((v) => (v == null || v === "" ? null : String(v).slice(0, 32))),
        premiumPayment: z.preprocess((value) => {
          if (value === "" || value === undefined) return null;
          if (typeof value === "number" && !Number.isFinite(value)) return null;
          return value;
        }, z.union([z.number().finite(), z.null()]).optional()),
        row: z.coerce.number().int().nonnegative(),
      }),
    )
    /** Client batches above this; keep a single-request cap aligned with batch helper. */
    .max(IMPORT_BATCH_SIZE)
    .optional(),
});

function normalizeContractId(raw: string): string {
  return raw.trim().replace(/,/g, "").replace(/\s+/g, "");
}

export async function POST(request: NextRequest) {
  const auth = await requireOfficeContext(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json(
      {
        error: issue
          ? `Datos inválidos (${issue.path.join(".") || "body"}): ${issue.message}`
          : "Datos inválidos.",
      },
      { status: 400 },
    );
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const validContractNumbers: string[] = [];
  const invalidContractNumbers: string[] = [];
  for (const raw of parsed.data.contractNumbers) {
    const normalized = normalizeContractId(raw);
    const checked = contractNumberSchema.safeParse(normalized);
    if (checked.success) {
      validContractNumbers.push(checked.data);
    } else if (raw.trim()) {
      invalidContractNumbers.push(raw.trim().slice(0, 64));
    }
  }

  if (parsed.data.contractNumbers.length > 0 && validContractNumbers.length === 0) {
    return NextResponse.json(
      {
        error: `Números de póliza inválidos: ${invalidContractNumbers.slice(0, 5).join(", ") || "(vacíos)"}`,
      },
      { status: 400 },
    );
  }

  try {
    // Promotoría: office-wide. Asesor: only their own contracts (tenancy).
    const existing = await findContractsByNumbers(validContractNumbers, {
      officeId: parsed.data.officeId,
      consultantId:
        auth.ctx.role === "consultant" ? auth.ctx.consultantId : undefined,
    });
    const byNumber = new Map(existing.map((c) => [c.contract_number, c]));

    const duplicateDetails: Array<{
      contract: string;
      ticket: string;
      row: number;
    }> = [];

    if (parsed.data.details?.length) {
      const contractIds = existing.map((c) => c.id);
      if (contractIds.length > 0) {
        const existingDetailRows = await listDetailKeysForContractsAdmin(contractIds);

        const existingReceipts = new Set(
          existingDetailRows
            .filter((d) => d.receipt_number)
            .map((d) => `${d.contract_id}|${d.receipt_number}`),
        );
        const existingKeys = new Set(
          existingDetailRows.map(
            (d) =>
              `${d.contract_id}|${d.payment_date ?? ""}|${d.premium_payment ?? ""}`,
          ),
        );

        for (const row of parsed.data.details) {
          const checked = contractNumberSchema.safeParse(
            normalizeContractId(row.contractNumber),
          );
          if (!checked.success) continue;
          const contract = byNumber.get(checked.data);
          if (!contract) continue;
          if (row.receiptNumber) {
            if (existingReceipts.has(`${contract.id}|${row.receiptNumber}`)) {
              duplicateDetails.push({
                contract: checked.data,
                ticket: row.receiptNumber,
                row: row.row,
              });
            }
            continue;
          }
          const key = `${contract.id}|${row.paymentDate ?? ""}|${row.premiumPayment ?? ""}`;
          if (existingKeys.has(key)) {
            duplicateDetails.push({
              contract: checked.data,
              ticket: `${row.paymentDate ?? ""} / ${row.premiumPayment ?? ""}`,
              row: row.row,
            });
          }
        }
      }
    }

    return NextResponse.json({
      contracts: existing.map((c) => c.contract_number),
      details: duplicateDetails,
    });
  } catch (e) {
    console.error("check-duplicates:", e);
    return NextResponse.json(
      { error: "No se pudieron verificar duplicados." },
      { status: 500 },
    );
  }
}
