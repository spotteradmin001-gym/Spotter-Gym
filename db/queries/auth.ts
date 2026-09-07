import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt } from "drizzle-orm";

import { db } from "@/db/client";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import {
  generatePassword,
  hashPassword,
  isPasswordStrongEnough,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/src/features/auth/password";
import { SESSION_TTL_MS } from "@/src/features/auth/session";

export type UserRole = "admin" | "owner" | "employee" | "member";
export const USER_ROLES: UserRole[] = ["admin", "owner", "employee", "member"];

/**
 * The safe, mapped view of a `users` row — no `passwordHash`. This is what the
 * app passes around; the raw row never leaves this module.
 */
export type SessionUser = {
  id: string;
  email: string;
  phone: string | null;
  role: UserRole;
  /** null only for admins (enforced by users_gym_scope_check). */
  gymId: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

/** Caller-facing failures. The server-action layer maps this to user copy. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function requireEmail(raw: string): string {
  const email = normalizeEmail(raw);
  // Deliberately loose — an admin/owner types a colleague's real address here,
  // not the public, so a strict RFC regex would only reject valid addresses.
  if (!email || !email.includes("@") || email.length > 254) {
    throw new AuthError("Enter a valid email address.");
  }
  return email;
}

function requireRole(raw: string): UserRole {
  if (!USER_ROLES.includes(raw as UserRole)) {
    throw new AuthError("Pick a valid role.");
  }
  return raw as UserRole;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates an account. If `password` is omitted one is generated; either way the
 * caller gets it back exactly once (never re-derivable from the stored hash) and
 * the account is flagged to require a change on first login.
 *
 * Gym scope mirrors `users_gym_scope_check`: an admin must have no `gymId`,
 * every other role must have one. `gymId` is not verified against a `gyms` row
 * yet — the foreign key is added in Phase 2.
 */
export async function createUser(input: {
  email: string;
  role: string;
  gymId?: string | null;
  phone?: string | null;
  password?: string;
}): Promise<{ user: SessionUser; password: string }> {
  const email = requireEmail(input.email);
  const role = requireRole(input.role);
  const gymId = input.gymId?.trim() || null;

  if (role === "admin" && gymId) {
    throw new AuthError("An admin account is not tied to a gym.");
  }
  if (role !== "admin" && !gymId) {
    throw new AuthError("Pick which gym this account belongs to.");
  }

  const password = input.password?.trim() || generatePassword();
  if (!isPasswordStrongEnough(password)) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    throw new AuthError("An account with that email already exists.");
  }

  const [row] = await db
    .insert(users)
    .values({
      email,
      role,
      gymId,
      phone: input.phone?.trim() || null,
      passwordHash: hashPassword(password),
      mustChangePassword: true,
    })
    .returning();

  return { user: mapUser(row!), password };
}

/** Raw row incl. `passwordHash` — internal to auth (login, password change). */
export async function getUserByEmail(
  rawEmail: string,
): Promise<typeof users.$inferSelect | null> {
  const email = normalizeEmail(rawEmail);
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  return row ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Login / sessions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks credentials only. Throws a single generic `AuthError` for every
 * failure — unknown email, wrong password, deactivated account — so the caller
 * cannot leak which one it was. On success returns the mapped user; creating
 * the session row is a separate step (`createSession`).
 */
export async function verifyLogin(input: {
  email: string;
  password: string;
}): Promise<SessionUser> {
  const row = await getUserByEmail(input.email);
  if (!row || !row.isActive || !verifyPassword(input.password, row.passwordHash)) {
    throw new AuthError("Incorrect email or password.");
  }
  return mapUser(row);
}

/**
 * Opens a session for an already-verified user and stamps `lastLoginAt`. The
 * row's `expiresAt` and the cookie's Max-Age both come from `SESSION_TTL_MS`.
 */
export async function createSession(
  userId: string,
): Promise<{ sessionId: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  const [row] = await db
    .insert(sessions)
    .values({ userId, expiresAt })
    .returning({ id: sessions.id });
  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, userId));
  return { sessionId: row!.id, expiresAt };
}

/**
 * Resolves a session cookie value to its user. Returns null for a missing,
 * expired, or deactivated-user session. Never throws — every caller treats
 * null as "not logged in".
 */
export async function getSessionUser(
  sessionId: string,
): Promise<SessionUser | null> {
  if (!sessionId) return null;

  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row || !row.user.isActive) return null;
  return mapUser(row.user);
}

/**
 * Self-service password change for a signed-in user. Verifies the current
 * password, enforces the strength bar, clears `mustChangePassword`, and revokes
 * every session for the user — including the request's own, so a leaked cookie
 * (possibly the reason for the change) stops working immediately. The caller
 * clears the cookie and sends the user back through login.
 */
export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.id, input.userId))
    .limit(1);
  if (!row) {
    throw new AuthError("That account no longer exists.");
  }
  if (!verifyPassword(input.currentPassword, row.passwordHash)) {
    throw new AuthError("Current password is incorrect.");
  }
  if (!isPasswordStrongEnough(input.newPassword)) {
    throw new AuthError(
      `New password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }
  if (input.newPassword === input.currentPassword) {
    throw new AuthError("Choose a password you haven't used before.");
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(input.newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, input.userId));
  await db.delete(sessions).where(eq(sessions.userId, input.userId));
}

/** Logout — revokes exactly this one session. */
export async function deleteSession(sessionId: string): Promise<void> {
  if (!sessionId) return;
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

// ─────────────────────────────────────────────────────────────────────────────
// Forgot password
// ─────────────────────────────────────────────────────────────────────────────

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues a reset token for an active account. Returns null when the email
 * matches no active account — the caller shows the same generic response either
 * way, so the distinction never leaves this function (no account enumeration).
 * Any earlier unused tokens for the user are dropped so only the newest link
 * works.
 */
export async function createPasswordResetToken(
  rawEmail: string,
): Promise<{ email: string; token: string } | null> {
  const email = normalizeEmail(rawEmail);
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (!row || !row.isActive) return null;

  await db
    .delete(passwordResetTokens)
    .where(eq(passwordResetTokens.userId, row.id));

  const token = randomBytes(32).toString("base64url");
  await db.insert(passwordResetTokens).values({
    userId: row.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
  });

  return { email: row.email, token };
}

/**
 * Consumes a reset token: rejects an unknown, expired, or already-used token
 * with one generic `AuthError`; otherwise sets the new password, clears
 * `mustChangePassword`, marks the token used, and revokes every session.
 */
export async function resetPasswordWithToken(
  rawToken: string,
  newPassword: string,
): Promise<void> {
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, hashToken(rawToken)))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw new AuthError("This reset link is invalid or has expired.");
  }
  if (!isPasswordStrongEnough(newPassword)) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, row.userId));
  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));
  await db.delete(sessions).where(eq(sessions.userId, row.userId));
}

/**
 * Revokes every session for a user. Called on password change / reset and on
 * deactivation, so a leaked cookie stops working at once rather than lingering
 * until it expires.
 */
export async function deleteAllUserSessions(userId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
