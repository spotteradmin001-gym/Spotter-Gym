import "server-only";

import { and, asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { gyms, sessions, users } from "@/db/schema";
import { generatePassword, hashPassword } from "@/src/features/auth/password";

import {
  AuthError,
  createUser,
  deleteAllUserSessions,
  type SessionUser,
  type UserRole,
} from "./auth";
import {
  canResetPassword,
  purgeTempCredential,
  storeTempCredential,
} from "./temp-credentials";

/**
 * User-account reads for the admin console. The richer per-person records
 * (employee roster, member profile) arrive with their own tables in Phase 3;
 * until then "drill into a user" means this account row.
 */

function mapUser(row: typeof users.$inferSelect): SessionUser {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone ?? null,
    role: row.role as UserRole,
    gymId: row.gymId ?? null,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    lastLoginAt: row.lastLoginAt ? row.lastLoginAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getUser(id: string): Promise<SessionUser | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? mapUser(row) : null;
}

/** Every account attached to a gym, optionally filtered to one role. */
export async function listGymUsers(
  gymId: string,
  role?: UserRole,
): Promise<SessionUser[]> {
  const rows = await db
    .select()
    .from(users)
    .where(
      role
        ? and(eq(users.gymId, gymId), eq(users.role, role))
        : eq(users.gymId, gymId),
    )
    .orderBy(asc(users.email));
  return rows.map(mapUser);
}

export type GymUserCounts = {
  owners: number;
  employees: number;
  members: number;
};

export async function countGymUsersByRole(gymId: string): Promise<GymUserCounts> {
  const rows = await db
    .select({ role: users.role, n: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.gymId, gymId))
    .groupBy(users.role);

  const counts: GymUserCounts = { owners: 0, employees: 0, members: 0 };
  for (const row of rows) {
    if (row.role === "owner") counts.owners = row.n;
    else if (row.role === "employee") counts.employees = row.n;
    else if (row.role === "member") counts.members = row.n;
  }
  return counts;
}

/**
 * Admin action: create the owner login for a gym. The gym must exist and be
 * active. Returns the one-time password once — the admin reads it to the owner,
 * who must change it on first sign-in.
 */
export async function createOwnerForGym(input: {
  gymId: string;
  email: string;
  phone?: string;
}): Promise<{ user: SessionUser; password: string }> {
  const [gym] = await db
    .select({ id: gyms.id, isActive: gyms.isActive })
    .from(gyms)
    .where(eq(gyms.id, input.gymId))
    .limit(1);
  if (!gym) throw new AuthError("That gym no longer exists.");
  if (!gym.isActive) {
    throw new AuthError("Reactivate the gym before adding an owner.");
  }

  const created = await createUser({
    email: input.email,
    role: "owner",
    gymId: input.gymId,
    phone: input.phone,
  });
  // Make the one-time password retrievable until the owner sets their own.
  await storeTempCredential(created.user.id, created.password);
  return created;
}

/**
 * Staff-initiated password reset (CR-6). Generates a fresh one-time password,
 * forces a change on next login, revokes every session, and re-stores the new
 * value in the vault so it stays retrievable. Returns the plaintext once.
 *
 * RBAC (`canResetPassword`): an owner's password is admin-only; an employee's
 * or member's can also be reset by that gym's owner; an admin's never through
 * here. Members without a login yet are handled by the activation-link flow,
 * not this function — `targetUserId` must be a real `users` row.
 */
export async function resetUserPassword(
  actor: SessionUser,
  targetUserId: string,
): Promise<{ user: SessionUser; password: string }> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!row) throw new AuthError("That account no longer exists.");

  if (
    !canResetPassword(actor, { role: row.role as UserRole, gymId: row.gymId })
  ) {
    throw new AuthError("You can't reset that account's password.");
  }

  const password = generatePassword();
  await db
    .update(users)
    .set({
      passwordHash: hashPassword(password),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, targetUserId));

  await deleteAllUserSessions(targetUserId);
  await purgeTempCredential(targetUserId);
  await storeTempCredential(targetUserId, password);

  return { user: mapUser({ ...row, mustChangePassword: true }), password };
}

/**
 * Deactivate / reactivate any account. Deactivating also drops every session
 * so the login stops working at once.
 */
export async function setUserActive(input: {
  id: string;
  isActive: boolean;
}): Promise<void> {
  const rows = await db
    .update(users)
    .set({ isActive: input.isActive, updatedAt: new Date() })
    .where(eq(users.id, input.id))
    .returning({ id: users.id });
  if (rows.length === 0) throw new AuthError("That account no longer exists.");
  if (!input.isActive) {
    await db.delete(sessions).where(eq(sessions.userId, input.id));
  }
}
