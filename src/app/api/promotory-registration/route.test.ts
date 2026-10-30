import { beforeEach, describe, expect, it, vi } from "vitest";

const { authMocks, adminFrom, tokenRows } = vi.hoisted(() => ({
  authMocks: { createAuthUser: vi.fn(), deleteAuthUser: vi.fn() },
  adminFrom: vi.fn(),
  tokenRows: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth/admin", () => authMocks);
vi.mock("@/lib/supabase/admin", () => ({ supabaseAdmin: { from: (...args: unknown[]) => adminFrom(...args) } }));

import { POST } from "@/app/api/promotory-registration/route";
import { createPromotoryRegistrationTokenAdmin, getPromotoryRegistrationTokenAdmin } from "@/lib/db-admin/promotory-registration";

function makeQuery() {
  let operation = "select";
  let patch: Record<string, unknown> = {};
  const filters: Array<{ kind: "eq" | "gt"; key: string; value: unknown }> = [];
  const matches = (row: Record<string, unknown>) => filters.every(({ kind, key, value }) =>
    kind === "eq" ? row[key] === value : String(row[key]) > String(value),
  );
  return {
    insert: async (row: Record<string, unknown>) => { tokenRows.push({ ...row }); return { error: null }; },
    select() { return this; },
    update(value: Record<string, unknown>) { operation = "update"; patch = value; return this; },
    eq(key: string, value: unknown) { filters.push({ kind: "eq", key, value }); return this; },
    gt(key: string, value: unknown) { filters.push({ kind: "gt", key, value }); return this; },
    maybeSingle: async () => ({ data: tokenRows.find(matches) ?? null, error: null }),
    then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
      if (operation === "update") {
        const updated = tokenRows.filter(matches);
        updated.forEach((row) => Object.assign(row, patch));
        return Promise.resolve({ data: updated, error: null }).then(resolve, reject);
      }
      return Promise.resolve({ data: tokenRows.filter(matches), error: null }).then(resolve, reject);
    },
  };
}

async function register(token: string, email = "new-office@example.com") {
  return POST(new Request("http://localhost/api/promotory-registration", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, email, password: "SecurePass123" }),
  }) as never);
}

describe("promotoría registration endpoint", () => {
  beforeEach(() => {
    tokenRows.length = 0;
    adminFrom.mockImplementation(() => makeQuery());
    authMocks.createAuthUser.mockReset().mockResolvedValue({ data: { user: { id: "new-auth-user" } }, error: null });
    authMocks.deleteAuthUser.mockReset().mockResolvedValue({ error: null });
  });

  it("registers a promotoría account and consumes the invitation", async () => {
    const invitation = await createPromotoryRegistrationTokenAdmin("operator-id");
    expect((await getPromotoryRegistrationTokenAdmin(invitation.token)).valid).toBe(true);

    const response = await register(invitation.token);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ success: true, email: "new-office@example.com" });
    expect(authMocks.createAuthUser).toHaveBeenCalledWith(expect.objectContaining({
      email: "new-office@example.com",
      userMetadata: { intended_role: "promotory", role: "promotory" },
    }));
    expect(tokenRows[0].status).toBe("USED");
    expect(authMocks.deleteAuthUser).not.toHaveBeenCalled();
  });

  it("rejects invalid, expired, and previously used invitations without creating accounts", async () => {
    const invalid = await register("a".repeat(64));
    expect(invalid.status).toBe(410);

    const expiredToken = await createPromotoryRegistrationTokenAdmin("operator-id");
    tokenRows[0].expires_at = new Date(Date.now() - 1000).toISOString();
    const expired = await register(expiredToken.token, "expired@example.com");
    expect(expired.status).toBe(410);

    const usedToken = await createPromotoryRegistrationTokenAdmin("operator-id");
    const first = await register(usedToken.token, "first@example.com");
    const second = await register(usedToken.token, "second@example.com");
    expect(first.status).toBe(200);
    expect(second.status).toBe(410);
    expect(authMocks.createAuthUser).toHaveBeenCalledTimes(1);
  });

  it("rolls back the Auth user if the token is consumed concurrently", async () => {
    const invitation = await createPromotoryRegistrationTokenAdmin("operator-id");
    authMocks.createAuthUser.mockImplementationOnce(async () => {
      tokenRows[0].status = "USED";
      return { data: { user: { id: "racing-auth-user" } }, error: null };
    });

    const response = await register(invitation.token);
    expect(response.status).toBe(410);
    expect(authMocks.deleteAuthUser).toHaveBeenCalledWith("racing-auth-user");
  });

  it("rejects malformed registration fields", async () => {
    const response = await POST(new Request("http://localhost/api/promotory-registration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "bad", email: "not-an-email", password: "short" }),
    }) as never);
    expect(response.status).toBe(400);
    expect(authMocks.createAuthUser).not.toHaveBeenCalled();
  });
});
