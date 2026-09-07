/**
 * Integration test for db/queries/users.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset.
 *
 * FIND-MY-FIXTURE: rows are `test_users_*@example.com` / gym name
 * `test_users %`. No count/length assertions on shared tables.
 */
import { inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { gyms, sessions, users } from "@/db/schema";
import {
  AuthError,
  createSession,
  createUser,
  getSessionUser,
} from "./auth";
import { createGym, setGymActive } from "./gyms";
import {
  countGymUsersByRole,
  createOwnerForGym,
  getUser,
  listGymUsers,
  setUserActive,
} from "./users";

let gymId = "";
let otherGymId = "";
const createdUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_users Main" })).id;
    otherGymId = (await createGym({ name: "test_users Other" })).id;
  });
  afterAll(async () => {
    if (createdUserIds.length) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    await db.delete(users).where(like(users.email, "test_users_%"));
    await db.delete(gyms).where(like(gyms.name, "test_users %"));
    await closeDb();
  });
}

dbSuite("createOwnerForGym", () => {
  it("creates an owner scoped to the gym and returns the one-time password", async () => {
    const { user, password } = await createOwnerForGym({
      gymId,
      email: "test_users_owner@example.com",
    });
    createdUserIds.push(user.id);
    expect(user.role).toBe("owner");
    expect(user.gymId).toBe(gymId);
    expect(user.mustChangePassword).toBe(true);
    expect(password.length).toBeGreaterThanOrEqual(8);
  });

  it("refuses an unknown or inactive gym", async () => {
    await expect(
      createOwnerForGym({
        gymId: "00000000-0000-0000-0000-000000000000",
        email: "test_users_x@example.com",
      }),
    ).rejects.toBeInstanceOf(AuthError);

    await setGymActive({ id: otherGymId, isActive: false });
    await expect(
      createOwnerForGym({ gymId: otherGymId, email: "test_users_y@example.com" }),
    ).rejects.toThrow(/[Rr]eactivate/);
    await setGymActive({ id: otherGymId, isActive: true });
  });
});

dbSuite("counts, listing, drill-in scope", () => {
  it("countGymUsersByRole tallies each role for the gym", async () => {
    const emp = await createUser({
      email: "test_users_emp@example.com",
      role: "employee",
      gymId,
    });
    const mem = await createUser({
      email: "test_users_mem@example.com",
      role: "member",
      gymId,
    });
    createdUserIds.push(emp.user.id, mem.user.id);

    const counts = await countGymUsersByRole(gymId);
    expect(counts.owners).toBeGreaterThanOrEqual(1);
    expect(counts.employees).toBeGreaterThanOrEqual(1);
    expect(counts.members).toBeGreaterThanOrEqual(1);
  });

  it("listGymUsers filters to the gym and role", async () => {
    const owners = await listGymUsers(gymId, "owner");
    expect(owners.every((u) => u.gymId === gymId && u.role === "owner")).toBe(true);
  });

  it("getUser exposes the account; a user from another gym is detectable by gymId", async () => {
    const owners = await listGymUsers(gymId, "owner");
    const fetched = await getUser(owners[0]!.id);
    expect(fetched?.gymId).toBe(gymId);
    expect(fetched?.gymId).not.toBe(otherGymId);
  });
});

dbSuite("setUserActive", () => {
  it("deactivating revokes the account's sessions", async () => {
    const { user } = await createUser({
      email: "test_users_deact@example.com",
      role: "employee",
      gymId,
    });
    createdUserIds.push(user.id);
    const { sessionId } = await createSession(user.id);

    await setUserActive({ id: user.id, isActive: false });
    expect(await getSessionUser(sessionId)).toBeNull();

    await setUserActive({ id: user.id, isActive: true });
    expect((await getUser(user.id))?.isActive).toBe(true);
  });

  it("throws for an unknown account", async () => {
    await expect(
      setUserActive({ id: "00000000-0000-0000-0000-000000000000", isActive: true }),
    ).rejects.toThrow(/no longer exists/);
  });
});
