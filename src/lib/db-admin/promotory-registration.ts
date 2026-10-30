import "server-only";

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

const TOKEN_TYPE = "PROMOTORY_REGISTRATION";
const TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export type PromotoryRegistrationToken = {
  token: string;
  expiresAt: string;
};

export async function createPromotoryRegistrationTokenAdmin(
  createdBy: string,
): Promise<PromotoryRegistrationToken> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS).toISOString();
  const { error } = await supabaseAdmin.from("token").insert({
    token,
    type: TOKEN_TYPE,
    status: "ACTIVE",
    expires_at: expiresAt,
    metadata: { created_by: createdBy },
  });
  if (error) throw error;
  return { token, expiresAt };
}

export async function getPromotoryRegistrationTokenAdmin(token: string) {
  const { data, error } = await supabaseAdmin
    .from("token")
    .select("id, status, expires_at")
    .eq("token", token)
    .eq("type", TOKEN_TYPE)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { valid: false as const, reason: "invalid" as const };
  if (data.status !== "ACTIVE") return { valid: false as const, reason: "used" as const };
  if (Date.parse(data.expires_at) <= Date.now()) {
    return { valid: false as const, reason: "expired" as const };
  }
  return { valid: true as const, id: data.id, expiresAt: data.expires_at };
}

/** Conditional update makes a token consumable by only one registration request. */
export async function consumePromotoryRegistrationTokenAdmin(token: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("token")
    .update({ status: "USED", used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("token", token)
    .eq("type", TOKEN_TYPE)
    .eq("status", "ACTIVE")
    .gt("expires_at", new Date().toISOString())
    .select("id");
  if (error) throw error;
  return (data?.length ?? 0) === 1;
}
