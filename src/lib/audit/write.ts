import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditActorRole, AuditSource } from "@/lib/supabase";

export type AuditWriteInput = {
  officeId: string;
  actorUserId?: string | null;
  /** App may still pass `promotory`; persisted value is always `office`. */
  actorRole?: AuditActorRole | "promotory" | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  source?: AuditSource;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
};

/** Map session/app role to audit_log.actor_role (`promotory` → `office`). */
export function toAuditActorRole(
  role: string | null | undefined,
): AuditActorRole | null {
  if (role === "office" || role === "consultant" || role === "system") {
    return role;
  }
  if (role === "promotory") return "office";
  return null;
}

/**
 * Append-only write to `audit_log`. Failures are logged; callers keep succeeding.
 */
export async function writeAuditLog(
  client: SupabaseClient,
  input: AuditWriteInput,
): Promise<void> {
  const { error } = await client.from("audit_log").insert({
    office_id: input.officeId,
    actor_user_id: input.actorUserId ?? null,
    actor_role: toAuditActorRole(input.actorRole) ?? null,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    source: input.source ?? "ui",
    old_values: input.oldValues ?? {},
    new_values: input.newValues ?? {},
  });
  if (error) {
    console.error("audit_log insert failed", error);
  }
}

export function collectionAction(
  actionType: string,
): `collection.${string}` {
  return `collection.${actionType}`;
}

export function mapCollectionSource(
  source: "manual" | "import",
): AuditSource {
  return source === "import" ? "import" : "ui";
}
