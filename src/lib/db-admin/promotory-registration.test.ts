import { beforeEach, describe, expect, it, vi } from "vitest";

const { rows, from } = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  from: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from: (...args: unknown[]) => from(...args) },
}));

import {
  consumePromotoryRegistrationTokenAdmin,
  createPromotoryRegistrationTokenAdmin,
  getPromotoryRegistrationTokenAdmin,
} from "@/lib/db-admin/promotory-registration";

function makeQuery() {
  let operation = "select";
  let patch: Record<string, unknown> = {};
  const filters: Array<{ kind: "eq" | "gt"; key: string; value: unknown }> = [];
  const matches = (row: Record<string, unknown>) => filters.every(({ kind, key, value }) => {
    if (kind === "eq") return row[key] === value;
    return String(row[key]) > String(value);
  });
  const query = {
    insert: async (row: Record<string, unknown>) => {
      rows.push({ ...row });
      return { error: null };
    },
    select() { return this; },
    update(value: Record<string, unknown>) { operation = "update"; patch = value; return this; },
    eq(key: string, value: unknown) { filters.push({ kind: "eq", key, value }); return this; },
    gt(key: string, value: unknown) { filters.push({ kind: "gt", key, value }); return this; },
    maybeSingle: async () => ({ data: rows.find(matches) ?? null, error: null }),
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      try {
        if (operation === "update") {
          const updated = rows.filter(matches);
          updated.forEach((row) => Object.assign(row, patch));
          return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows.filter(matches), error: null }).then(resolve, reject);
      } catch (error) {
        return Promise.reject(error).then(resolve, reject);
      }
    },
  };
  return query;
}

describe("promotory registration tokens", () => {
  beforeEach(() => {
    rows.length = 0;
    from.mockImplementation(() => makeQuery());
  });

  it("creates a random token that is active for seven days", async () => {
    const before = Date.now();
    const created = await createPromotoryRegistrationTokenAdmin("operator-id");
    const row = rows[0];

    expect(created.token).toMatch(/^[a-f0-9]{64}$/);
    expect(row).toMatchObject({ token: created.token, type: "PROMOTORY_REGISTRATION", status: "ACTIVE", metadata: { created_by: "operator-id" } });
    expect(Date.parse(created.expiresAt)).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(await getPromotoryRegistrationTokenAdmin(created.token)).toMatchObject({ valid: true });
  });

  it("rejects missing and expired tokens", async () => {
    expect(await getPromotoryRegistrationTokenAdmin("a".repeat(64))).toEqual({ valid: false, reason: "invalid" });
    const created = await createPromotoryRegistrationTokenAdmin("operator-id");
    rows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    expect(await getPromotoryRegistrationTokenAdmin(created.token)).toEqual({ valid: false, reason: "expired" });
    expect(await consumePromotoryRegistrationTokenAdmin(created.token)).toBe(false);
  });

  it("consumes an active token exactly once", async () => {
    const created = await createPromotoryRegistrationTokenAdmin("operator-id");
    expect(await consumePromotoryRegistrationTokenAdmin(created.token)).toBe(true);
    expect(await getPromotoryRegistrationTokenAdmin(created.token)).toEqual({ valid: false, reason: "used" });
    expect(await consumePromotoryRegistrationTokenAdmin(created.token)).toBe(false);
  });
});
