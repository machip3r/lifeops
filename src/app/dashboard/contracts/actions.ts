"use server";

import { createManualContract } from "@/lib/contracts/manual-create";
import { createUserClient } from "@/lib/supabase/user-client";
import { zodFieldErrors } from "@/lib/validation/field-errors";
import { createManualContractSchema } from "@/lib/validation/schemas";

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
