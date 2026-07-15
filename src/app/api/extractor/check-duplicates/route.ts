import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertOfficeAccess,
  assertPromotory,
  requireOfficeContext,
} from "@/lib/auth/api";
import { findContractsByNumbers } from "@/lib/db-admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { contractNumberSchema } from "@/lib/validation/schemas";

const bodySchema = z.object({
  officeId: z.string().uuid(),
  contractNumbers: z.array(contractNumberSchema).max(2000),
  /** Optional detail checks: contract_number + payment_date + premium for duplicate detection */
  details: z
    .array(
      z.object({
        contractNumber: z.string().min(1).max(64),
        paymentDate: z.string().nullable().optional(),
        premiumPayment: z.number().nullable().optional(),
        row: z.number().int().nonnegative(),
      }),
    )
    .max(5000)
    .optional(),
});

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
    return NextResponse.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const access = assertOfficeAccess(auth.ctx, parsed.data.officeId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  try {
    const existing = await findContractsByNumbers(parsed.data.contractNumbers);
    const byNumber = new Map(existing.map((c) => [c.contract_number, c]));

    const duplicateDetails: Array<{
      contract: string;
      ticket: string;
      row: number;
    }> = [];

    if (parsed.data.details?.length) {
      const contractIds = existing.map((c) => c.id);
      if (contractIds.length > 0) {
        const { data: details } = await supabaseAdmin
          .from("contract_detail")
          .select("contract_id, payment_date, premium_payment")
          .in("contract_id", contractIds);

        const existingKeys = new Set(
          (details || []).map(
            (d) =>
              `${d.contract_id}|${d.payment_date ?? ""}|${d.premium_payment ?? ""}`,
          ),
        );

        for (const row of parsed.data.details) {
          const contract = byNumber.get(row.contractNumber);
          if (!contract) continue;
          const key = `${contract.id}|${row.paymentDate ?? ""}|${row.premiumPayment ?? ""}`;
          if (existingKeys.has(key)) {
            duplicateDetails.push({
              contract: row.contractNumber,
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
