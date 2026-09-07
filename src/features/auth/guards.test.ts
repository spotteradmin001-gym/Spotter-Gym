import { describe, expect, it } from "vitest";

import { AuthError, type SessionUser } from "@/db/queries";

import { decideGuard, isInGymScope, requireGymScope } from "./guards";

function user(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "u1",
    email: "u@example.com",
    phone: null,
    role: "owner",
    gymId: "gym-1",
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("decideGuard", () => {
  it("sends a signed-out visitor to login", () => {
    expect(decideGuard(null, [])).toBe("login");
    expect(decideGuard(null, ["admin"])).toBe("login");
  });

  it("forces a password change before anything else", () => {
    expect(decideGuard(user({ mustChangePassword: true }), ["owner"])).toBe(
      "change-password",
    );
  });

  it("allows the password-change route itself through when told to", () => {
    expect(
      decideGuard(user({ mustChangePassword: true }), [], true),
    ).toBe("ok");
  });

  it("passes a user whose role is allowed", () => {
    expect(decideGuard(user({ role: "owner" }), ["owner", "admin"])).toBe("ok");
  });

  it("rejects a user whose role is not allowed", () => {
    expect(decideGuard(user({ role: "employee" }), ["owner"])).toBe("forbidden");
    expect(decideGuard(user({ role: "member" }), ["admin"])).toBe("forbidden");
  });

  it("with no role restriction, any signed-in past-gate user is ok", () => {
    expect(decideGuard(user({ role: "member" }), [])).toBe("ok");
  });
});

describe("isInGymScope / requireGymScope", () => {
  it("an admin reaches any gym", () => {
    const admin = user({ role: "admin", gymId: null });
    expect(isInGymScope(admin, "gym-9")).toBe(true);
    expect(() => requireGymScope(admin, "gym-9")).not.toThrow();
  });

  it("a non-admin reaches only their own gym", () => {
    const owner = user({ role: "owner", gymId: "gym-1" });
    expect(isInGymScope(owner, "gym-1")).toBe(true);
    expect(isInGymScope(owner, "gym-2")).toBe(false);
    expect(() => requireGymScope(owner, "gym-2")).toThrow(AuthError);
  });
});
