import type { SupabaseClient } from "@supabase/supabase-js";
import type { AuditActorRole, AuditLogEntry, AuditSource } from "@/lib/supabase";

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
function toAuditActorRole(
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

/** `audit_log` reads (RLS: promotoría sees its office; asesor sees its own pólizas). */
export function createAuditLogDb(supabase: SupabaseClient) {
  return {
    /** Append one entry (same as `writeAuditLog` with this client). */
    write: (input: AuditWriteInput) => writeAuditLog(supabase, input),

    /** Latest activity of one póliza / client / asesor, newest first. */
    listByEntity: async (
      entityType: "contract" | "client" | "consultant",
      entityId: string,
      limit = 30,
    ): Promise<AuditLogEntry[]> => {
      const { data, error } = await supabase
        .from("audit_log")
        .select("id, action, actor_role, source, old_values, new_values, created_at")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
  };
}

/** Who performs a UI edit (from `resolveOfficeContext`). */
export type AuditActor = {
  userId: string;
  officeId: string;
  role: "promotory" | "consultant";
};

function emptyToNull(value: unknown): unknown {
  return value === undefined || value === "" ? null : value;
}

/** Only the fields that changed (`""` and `null` count as empty). */
export function auditDiff(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { oldValues: Record<string, unknown>; newValues: Record<string, unknown> } {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    const prev = emptyToNull(before[key]);
    const next = emptyToNull(after[key]);
    if (String(prev) !== String(next)) {
      oldValues[key] = prev;
      newValues[key] = next;
    }
  }
  return { oldValues, newValues };
}
