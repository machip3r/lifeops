/** `audit_log` writes from privileged route handlers. */
import "server-only";

import { writeAuditLog, type AuditWriteInput } from "@/lib/db/audit-log";
import { supabaseAdmin } from "@/lib/supabase/admin";

export function writeAuditLogAdmin(input: AuditWriteInput): Promise<void> {
  return writeAuditLog(supabaseAdmin, input);
}
