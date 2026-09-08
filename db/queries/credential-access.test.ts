/**
 * Integration test for db/queries/credential-access.ts against the Neon
 * `preview` branch. Skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: emails `test_credacc_*@example.com`, gym names
 * `test_credacc %`. No count/length assertions on shared tables.
 */
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { closeDb, db } from "@/db/client";
import { audits, employees, gyms, sessions, tempCredentials, users } from "@/db/schema";

import { AuthError, createSession, createUser, getSessionUser } from "./auth";
import { resetCredential, revealCredential } from "./credential-access";
import { createEmployee } from "./employees";
import { createGym } from "./gyms";
import { getUser } from "./users";
import { createOwnerForGym } from "./users";

const TEST_KEY = Buffer.from("0123456789abcdef0123456789abcdef").toString("base64");
const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

let gymAId = "";
let gymBId = "";
let admin = null as Awaited<ReturnType<typeof getUser>>;
let ownerA = null as Awaited<ReturnType<typeof getUser>>;
let ownerB = null as Awaited<ReturnType<typeof getUser>>;
const createdUserIds: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
});

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymAId = (await createGym({ name: "test_credacc A" })).id;
    gymBId = (await createGym({ name: "test_credacc B" })).id;

    const a = await createUser({ email: "test_credacc_admin@example.com", role: "admin" });
    const oa = await createUser({
      email: "test_credacc_owner_a@example.com",
      role: "owner",
      gymId: gymAId,
    });
    const ob = await createUser({
      email: "test_credacc_owner_b@example.com",
      role: "owner",
      gymId: gymBId,
    });
    createdUserIds.push(a.user.id, oa.user.id, ob.user.id);
    admin = await getUser(a.user.id);
    ownerA = await getUser(oa.user.id);
    ownerB = await getUser(ob.user.id);
  });

  afterAll(async () => {
    if (createdUserIds.length) {
      await db.delete(audits).where(inArray(audits.actorUserId, createdUserIds));
      await db.delete(tempCredentials).where(inArray(tempCredentials.userId, createdUserIds));
      await db.delete(employees).where(inArray(employees.userId, createdUserIds));
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    await db.delete(users).where(like(users.email, "test_credacc_%"));
    await db.delete(gyms).where(like(gyms.name, "test_credacc %"));
    await closeDb();
  });
}

async function auditRows(action: string, targetId: string) {
  return db
    .select()
    .from(audits)
    .where(and(eq(audits.action, action), eq(audits.targetId, targetId)));
}

dbSuite("revealCredential", () => {
  it("returns the stored password to an admin and writes a cred.reveal audit row", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user, password } = await createOwnerForGym({
      gymId: gymAId,
      email: "test_credacc_reveal_owner@example.com",
    });
    createdUserIds.push(user.id);

    expect(await revealCredential(admin!, user.id)).toBe(password);

    const rows = await auditRows("cred.reveal", user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(admin!.id);
    expect(rows[0]!.actorRole).toBe("admin");
    expect(rows[0]!.gymId).toBe(gymAId);
    expect(rows[0]!.meta).toMatchObject({ revealed: true });
  });

  it("a blocked reveal throws and writes no audit row", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { user } = await createOwnerForGym({
      gymId: gymAId,
      email: "test_credacc_reveal_blocked@example.com",
    });
    createdUserIds.push(user.id);

    // an owner may never see another owner's temp password
    await expect(revealCredential(ownerA!, user.id)).rejects.toBeInstanceOf(AuthError);
    expect(await auditRows("cred.reveal", user.id)).toHaveLength(0);
  });
});

dbSuite("resetCredential", () => {
  it("regenerates, revokes sessions, links to the reset page, and audits cred.reset", async () => {
    vi.stubEnv("CREDENTIAL_ENC_KEY", TEST_KEY);
    const { employee, password } = await createEmployee({
      gymId: gymAId,
      name: "test_credacc Emp",
      email: "test_credacc_reset_emp@example.com",
    });
    createdUserIds.push(employee.userId);
    const { sessionId } = await createSession(employee.userId);

    const result = await resetCredential(ownerA!, employee.userId);

    expect(result.password).not.toBe(password);
    expect(result.resetLink).toContain("/reset-password/");
    // link-first: the share message carries the reset link, not the raw password
    expect(result.shareMessage).toContain(result.resetLink);
    expect(result.shareMessage).not.toContain(result.password);

    expect(await getSessionUser(sessionId)).toBeNull();

    const rows = await auditRows("cred.reset", employee.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.actorUserId).toBe(ownerA!.id);
    expect(rows[0]!.meta).toMatchObject({ targetRole: "employee" });
  });

  it("an owner cannot reset another gym's employee — throws, no audit", async () => {
    const { employee } = await createEmployee({
      gymId: gymAId,
      name: "test_credacc Emp2",
      email: "test_credacc_reset_emp2@example.com",
    });
    createdUserIds.push(employee.userId);

    await expect(
      resetCredential(ownerB!, employee.userId),
    ).rejects.toBeInstanceOf(AuthError);
    expect(await auditRows("cred.reset", employee.userId)).toHaveLength(0);
  });
});
