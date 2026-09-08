/**
 * Tests for db/queries/temp-credentials.ts. The RBAC rules are pure and always
 * run; the storage/reveal/reset behaviour is an integration suite against the
 * Neon `preview` branch, skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: emails `test_cred_*@example.com`, gym names `test_cred %`.
 * No count/length assertions on shared tables.
 */
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { closeDb, db } from "@/db/client";
import { employees, gyms, sessions, tempCredentials, users } from "@/db/schema";

import {
  AuthError,
  changeOwnPassword,
  createSession,
  createUser,
  getSessionUser,
  type SessionUser,
} from "./auth";
import { createEmployee } from "./employees";
import { createGym } from "./gyms";
import {
  canResetPassword,
  canRevealCredential,
  purgeTempCredential,
  revealTempCredential,
  storeTempCredential,
} from "./temp-credentials";
import { createOwnerForGym, resetUserPassword } from "./users";

// Hardcoded base64 of 32 bytes — CI needs no real secret.
const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");

function actor(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    id: "actor-id",
    email: "actor@example.com",
    phone: null,
    role: "admin",
    gymId: null,
    isActive: true,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("credential RBAC rules", () => {
  const admin = actor({ role: "admin", gymId: null });
  const ownerA = actor({ role: "owner", gymId: "gym-a" });
  const ownerB = actor({ role: "owner", gymId: "gym-b" });
  const employeeA = actor({ role: "employee", gymId: "gym-a" });
  const memberA = actor({ role: "member", gymId: "gym-a" });

  it("owner temp password is revealable by admin only", () => {
    expect(canRevealCredential(admin, { role: "owner", gymId: "gym-a" })).toBe(true);
    expect(canRevealCredential(ownerA, { role: "owner", gymId: "gym-a" })).toBe(false);
    expect(canRevealCredential(employeeA, { role: "owner", gymId: "gym-a" })).toBe(false);
  });

  it("employee temp password is revealable by admin or that gym's owner", () => {
    expect(canRevealCredential(admin, { role: "employee", gymId: "gym-a" })).toBe(true);
    expect(canRevealCredential(ownerA, { role: "employee", gymId: "gym-a" })).toBe(true);
    expect(canRevealCredential(ownerB, { role: "employee", gymId: "gym-a" })).toBe(false);
    expect(canRevealCredential(employeeA, { role: "employee", gymId: "gym-a" })).toBe(false);
    expect(canRevealCredential(memberA, { role: "employee", gymId: "gym-a" })).toBe(false);
  });

  it("member and admin targets are never revealed through the vault", () => {
    expect(canRevealCredential(admin, { role: "member", gymId: "gym-a" })).toBe(false);
    expect(canRevealCredential(admin, { role: "admin", gymId: null })).toBe(false);
  });

  it("reset: admin resets owners; admin or same-gym owner resets employees/members", () => {
    expect(canResetPassword(admin, { role: "owner", gymId: "gym-a" })).toBe(true);
    expect(canResetPassword(ownerA, { role: "owner", gymId: "gym-a" })).toBe(false);
    expect(canResetPassword(ownerA, { role: "employee", gymId: "gym-a" })).toBe(true);
    expect(canResetPassword(ownerA, { role: "member", gymId: "gym-a" })).toBe(true);
    expect(canResetPassword(ownerB, { role: "employee", gymId: "gym-a" })).toBe(false);
  });

  it("reset never targets an admin", () => {
    expect(canResetPassword(admin, { role: "admin", gymId: null })).toBe(false);
  });
});

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

let gymAId = "";
let gymBId = "";
const createdUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymAId = (await createGym({ name: "test_cred A" })).id;
    gymBId = (await createGym({ name: "test_cred B" })).id;
  });
  afterAll(async () => {
    if (createdUserIds.length) {
      await db
        .delete(tempCredentials)
        .where(inArray(tempCredentials.userId, createdUserIds));
      await db.delete(employees).where(inArray(employees.userId, createdUserIds));
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    await db.delete(users).where(like(users.email, "test_cred_%"));
    await db.delete(gyms).where(like(gyms.name, "test_cred %"));
    await closeDb();
  });
}

dbSuite("store on account creation", () => {
  it("createOwnerForGym stores a retrievable one-time password", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user, password } = await createOwnerForGym({
      gymId: gymAId,
      email: "test_cred_owner_a@example.com",
    });
    createdUserIds.push(user.id);

    expect(await revealTempCredential(actor({ role: "admin" }), user.id)).toBe(password);
  });

  it("createEmployee stores it; same-gym owner reveals, other-gym owner and staff cannot", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { employee, password } = await createEmployee({
      gymId: gymAId,
      name: "test_cred Emp",
      email: "test_cred_emp_a@example.com",
    });
    createdUserIds.push(employee.userId);

    expect(
      await revealTempCredential(actor({ role: "owner", gymId: gymAId }), employee.userId),
    ).toBe(password);
    await expect(
      revealTempCredential(actor({ role: "owner", gymId: gymBId }), employee.userId),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      revealTempCredential(actor({ role: "employee", gymId: gymAId }), employee.userId),
    ).rejects.toBeInstanceOf(AuthError);
  });

  it("an owner's own temp password stays admin-only", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user } = await createOwnerForGym({
      gymId: gymAId,
      email: "test_cred_owner_locked@example.com",
    });
    createdUserIds.push(user.id);

    await expect(
      revealTempCredential(actor({ role: "owner", gymId: gymAId }), user.id),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

dbSuite("reveal is closed after first login", () => {
  it("returns null and purges the row once must_change_password flips to false", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user, password } = await createOwnerForGym({
      gymId: gymAId,
      email: "test_cred_firstlogin@example.com",
    });
    createdUserIds.push(user.id);

    await changeOwnPassword({
      userId: user.id,
      currentPassword: password,
      newPassword: "a-brand-new-password-1",
    });

    expect(await revealTempCredential(actor({ role: "admin" }), user.id)).toBeNull();
    const rows = await db
      .select()
      .from(tempCredentials)
      .where(eq(tempCredentials.userId, user.id));
    expect(rows).toHaveLength(0);
  });
});

dbSuite("resetUserPassword", () => {
  it("forces a change, revokes sessions, and re-stores a fresh retrievable password", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { employee, password } = await createEmployee({
      gymId: gymAId,
      name: "test_cred Reset",
      email: "test_cred_reset@example.com",
    });
    createdUserIds.push(employee.userId);
    const { sessionId } = await createSession(employee.userId);

    const admin = actor({ role: "admin" });
    const result = await resetUserPassword(admin, employee.userId);

    expect(result.password).not.toBe(password);
    expect(result.user.mustChangePassword).toBe(true);
    expect(await getSessionUser(sessionId)).toBeNull();
    expect(await revealTempCredential(admin, employee.userId)).toBe(result.password);
  });

  it("an owner cannot reset another gym's employee, and no one resets an admin", async () => {
    const { employee } = await createEmployee({
      gymId: gymAId,
      name: "test_cred RBAC",
      email: "test_cred_reset_rbac@example.com",
    });
    createdUserIds.push(employee.userId);

    await expect(
      resetUserPassword(actor({ role: "owner", gymId: gymBId }), employee.userId),
    ).rejects.toBeInstanceOf(AuthError);

    const adminUser = await createUser({
      email: "test_cred_admin@example.com",
      role: "admin",
    });
    createdUserIds.push(adminUser.user.id);
    await expect(
      resetUserPassword(actor({ role: "admin" }), adminUser.user.id),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

dbSuite("store / purge helpers", () => {
  it("purgeTempCredential removes the row so reveal returns null", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user } = await createUser({
      email: "test_cred_purge@example.com",
      role: "owner",
      gymId: gymAId,
    });
    createdUserIds.push(user.id);

    await storeTempCredential(user.id, "temp-pw-value");
    expect(await revealTempCredential(actor({ role: "admin" }), user.id)).toBe("temp-pw-value");

    await purgeTempCredential(user.id);
    expect(await revealTempCredential(actor({ role: "admin" }), user.id)).toBeNull();
  });

  it("with the vault disabled, store is a no-op but RBAC still applies", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", undefined);
    const { user } = await createUser({
      email: "test_cred_off@example.com",
      role: "employee",
      gymId: gymAId,
    });
    createdUserIds.push(user.id);

    await storeTempCredential(user.id, "never-stored");
    const rows = await db
      .select()
      .from(tempCredentials)
      .where(eq(tempCredentials.userId, user.id));
    expect(rows).toHaveLength(0);

    expect(await revealTempCredential(actor({ role: "admin" }), user.id)).toBeNull();
    await expect(
      revealTempCredential(actor({ role: "member", gymId: gymAId }), user.id),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
