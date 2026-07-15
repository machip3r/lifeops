import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { findContractsByNumbers } from "@/lib/db-admin";
import {
  chunkArray,
  EXTRACTOR_CONTRACT_NUMBER_BATCH,
  EXTRACTOR_DB_IN_BATCH,
  EXTRACTOR_DETAIL_CHECK_BATCH,
} from "@/lib/extractor/batch";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  contractNumberSchema,
  LIMITS,
} from "@/lib/validation/schemas";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  /** Accept raw strings; validate each entry so one bad póliza does not blank the import. */
  contractNumbers: z.array(z.coerce.string()).max(EXTRACTOR_CONTRACT_NUMBER_BATCH),
  /** Optional detail checks: contract_number + payment_date + premium for duplicate detection */
  details: z
    .array(
      z.object({
        contractNumber: z.coerce.string().min(1).max(LIMITS.contractNumber),
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
    .max(EXTRACTOR_DETAIL_CHECK_BATCH)
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

  const promotory = assertPromotory(auth.ctx);
  if (!promotory.ok) {
    return NextResponse.json({ error: promotory.error }, { status: promotory.status });
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
    const existing = await findContractsByNumbers(validContractNumbers);
    const byNumber = new Map(existing.map((c) => [c.contract_number, c]));

    const duplicateDetails: Array<{
      contract: string;
      ticket: string;
      row: number;
    }> = [];

    if (parsed.data.details?.length) {
      const contractIds = existing.map((c) => c.id);
      if (contractIds.length > 0) {
        const existingDetailRows: Array<{
          contract_id: string;
          payment_date: string | null;
          premium_payment: number | null;
        }> = [];
        for (const idChunk of chunkArray(contractIds, EXTRACTOR_DB_IN_BATCH)) {
          const { data: details, error: detailsError } = await supabaseAdmin
            .from("contract_detail")
            .select("contract_id, payment_date, premium_payment")
            .in("contract_id", idChunk);
          if (detailsError) throw detailsError;
          existingDetailRows.push(
            ...((details || []) as Array<{
              contract_id: string;
              payment_date: string | null;
              premium_payment: number | null;
            }>),
          );
        }

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
