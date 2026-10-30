import { beforeEach, describe, expect, it, vi } from "vitest";

const actionMocks = vi.hoisted(() => ({
  resolveOfficeContext: vi.fn(),
  createPromotoryRegistrationTokenAdmin: vi.fn(),
}));

vi.mock("@/lib/auth/api", () => ({ resolveOfficeContext: actionMocks.resolveOfficeContext }));
vi.mock("@/lib/db-admin", () => ({ createPromotoryRegistrationTokenAdmin: actionMocks.createPromotoryRegistrationTokenAdmin }));
vi.mock("@/lib/db", () => ({ createDb: vi.fn() }));
vi.mock("@/lib/supabase/user-client", () => ({ createUserClient: vi.fn() }));

import {
  canCreatePromotoryRegistrationLinkAction,
  createPromotoryRegistrationLinkAction,
} from "@/app/dashboard/profile/actions";

describe("promotoría registration link profile actions", () => {
  beforeEach(() => {
    process.env.PROMOTORY_INVITE_GENERATOR_EMAIL = "operator@example.com";
    delete process.env.APP_BASE_URL;
    process.env.NEXT_PUBLIC_APP_URL = "https://lifeops.example.com";
    actionMocks.resolveOfficeContext.mockReset();
    actionMocks.createPromotoryRegistrationTokenAdmin.mockReset().mockResolvedValue({
      token: "b".repeat(64),
      expiresAt: "2026-11-06T00:00:00.000Z",
    });
  });

  it("shows the generator only to the configured promotoría account", async () => {
    actionMocks.resolveOfficeContext.mockResolvedValue({
      ok: true,
      ctx: { role: "promotory", user: { id: "operator-id", email: "OPERATOR@example.com" } },
    });
    expect(await canCreatePromotoryRegistrationLinkAction("valid-session-token-1234567890")).toBe(true);

    actionMocks.resolveOfficeContext.mockResolvedValue({
      ok: true,
      ctx: { role: "consultant", user: { id: "consultant-id", email: "operator@example.com" } },
    });
    expect(await canCreatePromotoryRegistrationLinkAction("valid-session-token-1234567890")).toBe(false);
  });

  it("generates the absolute register URL only for that account", async () => {
    actionMocks.resolveOfficeContext.mockResolvedValue({
      ok: true,
      ctx: { role: "promotory", user: { id: "operator-id", email: "operator@example.com" } },
    });
    const result = await createPromotoryRegistrationLinkAction("valid-session-token-1234567890");
    expect(result).toMatchObject({
      ok: true,
      link: `https://lifeops.example.com/register?token=${"b".repeat(64)}`,
    });
    expect(actionMocks.createPromotoryRegistrationTokenAdmin).toHaveBeenCalledWith("operator-id");
  });

  it("does not create tokens for an unauthorized user", async () => {
    actionMocks.resolveOfficeContext.mockResolvedValue({
      ok: true,
      ctx: { role: "promotory", user: { id: "other-id", email: "other@example.com" } },
    });
    const result = await createPromotoryRegistrationLinkAction("valid-session-token-1234567890");
    expect(result).toMatchObject({ ok: false });
    expect(actionMocks.createPromotoryRegistrationTokenAdmin).not.toHaveBeenCalled();
  });
});
