/**
 * Privileged persistence adapter (service role) — server only.
 *
 * Hexagonal mapping for LifeOps:
 * - Route handlers / Server Actions = input adapters (HTTP / UI)
 * - This folder (+ `src/lib/db/` for RLS-scoped reads/writes) = output adapter
 * - Every Supabase/SQL request lives here or in `src/lib/db/` — never in routes, pages or helpers
 *
 * Prefer:
 * - `db` (`src/lib/db/`) when the caller has a user JWT and RLS is enough
 * - `db-admin` (this folder) for cross-tenant / bypass-RLS table work
 * - `src/lib/auth/admin.ts` for Auth Admin; `src/lib/storage/admin.ts` for Storage
 * - This module may orchestrate Auth/Storage helpers for multi-step flows
 */
import "server-only";

export * from "./result";
export * from "./audit";
export * from "./tenancy";
export * from "./consultants";
export * from "./invites";
export * from "./contracts";
export * from "./contract-cascade";
export * from "./clients";
export * from "./documents";
export * from "./office-cleanup";
export * from "./promotory-registration";
