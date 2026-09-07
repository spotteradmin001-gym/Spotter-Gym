/**
 * Integration test for db/queries/auth.ts against the real Neon `preview`
 * branch (db/client.ts reads DATABASE_URL, which points at preview locally and
 * in CI — never production).
 *
 * Requires the schema applied:  npm run db:migrate
 *
 * Skipped when DATABASE_URL is unset — locally it comes from `.env.local`
 * (preview branch); in CI it comes from repo secrets. Until those secrets are
 * added the suite no-ops instead of failing the pipeline.
 *
 * SHARED DATABASE — FIND-MY-FIXTURE: every assertion locates this file's own
 * `test_auth_*@example.com` rows. Never assert a list length or a total row
 * count; other suites and the seeded admin share the `users` table.
 */
import { eq, inArray, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { passwordResetTokens, sessions, users } from "@/db/schema";
import { verifyPassword } from "@/src/features/auth/password";
import {
  AuthError,
  changeOwnPassword,
  createPasswordResetToken,
  createSession,
  createUser,
  deleteAllUserSessions,
  deleteSession,
  getSessionUser,
  getUserByEmail,
  resetPasswordWithToken,
  verifyLogin,
} from "./auth";

const GYM_ID = "test_auth_gym_0000";
const EMAIL_ADMIN = "test_auth_admin@example.com";
const EMAIL_OWNER = "test_auth_owner@example.com";
const EMAIL_LOGIN = "test_auth_login@example.com";
const EMAIL_SESSION = "test_auth_session@example.com";
const EMAIL_DUP = "test_auth_dup@example.com";

const createdUserIds: string[] = [];
const createdSessionIds: string[] = [];

if (process.env.DATABASE_URL) {
  afterAll(async () => {
    if (createdSessionIds.length) {
      await db.delete(sessions).where(inArray(sessions.id, createdSessionIds));
    }
    if (createdUserIds.length) {
      await db.delete(sessions).where(inArray(sessions.userId, createdUserIds));
    }
    await db.delete(users).where(like(users.email, "test_auth_%"));
    await closeDb();
  });
}

dbSuite("createUser", () => {
  it("generates a one-time password and stores only its scrypt hash", async () => {
    const { user, password } = await createUser({
      email: EMAIL_ADMIN,
      role: "admin",
    });
    createdUserIds.push(user.id);

    expect(user.email).toBe(EMAIL_ADMIN);
    expect(user.role).toBe("admin");
    expect(user.gymId).toBeNull();
    expect(user.mustChangePassword).toBe(true);
    expect(password.length).toBeGreaterThanOrEqual(8);

    const row = await getUserByEmail(EMAIL_ADMIN);
    expect(row).not.toBeNull();
    expect(row!.passwordHash).not.toContain(password);
    expect(verifyPassword(password, row!.passwordHash)).toBe(true);
  });

  it("requires a gymId for non-admin roles and forbids it for admins", async () => {
    await expect(
      createUser({ email: "test_auth_nogym@example.com", role: "owner" }),
    ).rejects.toBeInstanceOf(AuthError);

    await expect(
      createUser({
        email: "test_auth_admingym@example.com",
        role: "admin",
        gymId: GYM_ID,
      }),
    ).rejects.toBeInstanceOf(AuthError);

    const { user } = await createUser({
      email: EMAIL_OWNER,
      role: "owner",
      gymId: GYM_ID,
    });
    createdUserIds.push(user.id);
    expect(user.gymId).toBe(GYM_ID);
  });

  it("rejects a duplicate email", async () => {
    const { user } = await createUser({ email: EMAIL_DUP, role: "admin" });
    createdUserIds.push(user.id);
    await expect(
      createUser({ email: EMAIL_DUP.toUpperCase(), role: "admin" }),
    ).rejects.toThrow(/already exists/);
  });
});

dbSuite("verifyLogin", () => {
  it("returns the user for correct credentials", async () => {
    const { user, password } = await createUser({
      email: EMAIL_LOGIN,
      role: "owner",
      gymId: GYM_ID,
    });
    createdUserIds.push(user.id);

    const result = await verifyLogin({ email: EMAIL_LOGIN, password });
    expect(result.id).toBe(user.id);
  });

  it("throws the same generic AuthError for a wrong password and an unknown email", async () => {
    await expect(
      verifyLogin({ email: EMAIL_LOGIN, password: "definitely-wrong" }),
    ).rejects.toThrow("Incorrect email or password.");

    await expect(
      verifyLogin({ email: "test_auth_ghost@example.com", password: "x" }),
    ).rejects.toThrow("Incorrect email or password.");
  });

  it("rejects a deactivated account", async () => {
    const { user, password } = await createUser({
      email: "test_auth_inactive@example.com",
      role: "admin",
    });
    createdUserIds.push(user.id);
    await db
      .update(users)
      .set({ isActive: false })
      .where(eq(users.id, user.id));

    await expect(
      verifyLogin({ email: "test_auth_inactive@example.com", password }),
    ).rejects.toThrow("Incorrect email or password.");
  });
});

dbSuite("sessions", () => {
  it("createSession opens a resolvable session and stamps lastLoginAt", async () => {
    const { user } = await createUser({
      email: EMAIL_SESSION,
      role: "admin",
    });
    createdUserIds.push(user.id);

    const { sessionId } = await createSession(user.id);
    createdSessionIds.push(sessionId);

    const resolved = await getSessionUser(sessionId);
    expect(resolved?.id).toBe(user.id);

    const row = await getUserByEmail(EMAIL_SESSION);
    expect(row!.lastLoginAt).not.toBeNull();
  });

  it("getSessionUser returns null for an expired session", async () => {
    const row = await getUserByEmail(EMAIL_SESSION);
    const [expired] = await db
      .insert(sessions)
      .values({
        userId: row!.id,
        expiresAt: new Date(Date.now() - 60_000),
      })
      .returning({ id: sessions.id });
    createdSessionIds.push(expired!.id);

    expect(await getSessionUser(expired!.id)).toBeNull();
  });

  it("getSessionUser returns null for a missing id and an empty string", async () => {
    expect(await getSessionUser("")).toBeNull();
    expect(await getSessionUser("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("deleteSession revokes just that session", async () => {
    const row = await getUserByEmail(EMAIL_SESSION);
    const a = await createSession(row!.id);
    const b = await createSession(row!.id);
    createdSessionIds.push(a.sessionId, b.sessionId);

    await deleteSession(a.sessionId);
    expect(await getSessionUser(a.sessionId)).toBeNull();
    expect(await getSessionUser(b.sessionId)).not.toBeNull();
  });

  it("deleteAllUserSessions revokes every session for the user", async () => {
    const row = await getUserByEmail(EMAIL_SESSION);
    const a = await createSession(row!.id);
    const b = await createSession(row!.id);
    createdSessionIds.push(a.sessionId, b.sessionId);

    await deleteAllUserSessions(row!.id);
    expect(await getSessionUser(a.sessionId)).toBeNull();
    expect(await getSessionUser(b.sessionId)).toBeNull();
  });
});

dbSuite("changeOwnPassword", () => {
  const EMAIL_CHANGE = "test_auth_change@example.com";

  it("swaps the hash, clears must_change_password, and revokes every session", async () => {
    const { user, password } = await createUser({
      email: EMAIL_CHANGE,
      role: "admin",
    });
    createdUserIds.push(user.id);
    const live = await createSession(user.id);
    createdSessionIds.push(live.sessionId);

    await changeOwnPassword({
      userId: user.id,
      currentPassword: password,
      newPassword: "brand-new-pw-9",
    });

    const row = await getUserByEmail(EMAIL_CHANGE);
    expect(row!.mustChangePassword).toBe(false);
    expect(verifyPassword("brand-new-pw-9", row!.passwordHash)).toBe(true);
    expect(verifyPassword(password, row!.passwordHash)).toBe(false);
    expect(await getSessionUser(live.sessionId)).toBeNull();
  });

  it("rejects a wrong current password and a too-short new one", async () => {
    const row = await getUserByEmail(EMAIL_CHANGE);
    await expect(
      changeOwnPassword({
        userId: row!.id,
        currentPassword: "not-it",
        newPassword: "another-good-pw",
      }),
    ).rejects.toThrow("Current password is incorrect.");

    await expect(
      changeOwnPassword({
        userId: row!.id,
        currentPassword: "brand-new-pw-9",
        newPassword: "short",
      }),
    ).rejects.toBeInstanceOf(AuthError);
  });
});

dbSuite("password reset tokens", () => {
  const EMAIL_RESET = "test_auth_reset@example.com";

  it("issues a token for an active account and null for an unknown email", async () => {
    const { user } = await createUser({ email: EMAIL_RESET, role: "admin" });
    createdUserIds.push(user.id);

    const issued = await createPasswordResetToken(EMAIL_RESET.toUpperCase());
    expect(issued?.email).toBe(EMAIL_RESET);
    expect(issued?.token.length).toBeGreaterThan(20);

    expect(await createPasswordResetToken("test_auth_nobody@example.com")).toBeNull();
  });

  it("stores only the token hash, never the raw token", async () => {
    const issued = await createPasswordResetToken(EMAIL_RESET);
    const rows = await db
      .select()
      .from(passwordResetTokens)
      .where(
        eq(
          passwordResetTokens.userId,
          (await getUserByEmail(EMAIL_RESET))!.id,
        ),
      );
    expect(rows.length).toBe(1); // the previous token was replaced
    expect(rows[0]!.tokenHash).not.toBe(issued!.token);
    expect(rows[0]!.tokenHash).toHaveLength(64);
  });

  it("resets the password, consumes the token, and revokes sessions", async () => {
    const user = (await getUserByEmail(EMAIL_RESET))!;
    const session = await createSession(user.id);
    createdSessionIds.push(session.sessionId);
    const issued = await createPasswordResetToken(EMAIL_RESET);

    await resetPasswordWithToken(issued!.token, "fresh-reset-pw-1");

    const after = await getUserByEmail(EMAIL_RESET);
    expect(verifyPassword("fresh-reset-pw-1", after!.passwordHash)).toBe(true);
    expect(after!.mustChangePassword).toBe(false);
    expect(await getSessionUser(session.sessionId)).toBeNull();

    // reused token now rejected
    await expect(
      resetPasswordWithToken(issued!.token, "another-pw-2"),
    ).rejects.toThrow("invalid or has expired");
  });

  it("rejects an unknown token and an expired token", async () => {
    await expect(
      resetPasswordWithToken("not-a-real-token", "whatever-pw-1"),
    ).rejects.toThrow("invalid or has expired");

    const user = (await getUserByEmail(EMAIL_RESET))!;
    const issued = await createPasswordResetToken(EMAIL_RESET);
    await db
      .update(passwordResetTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(passwordResetTokens.userId, user.id));

    await expect(
      resetPasswordWithToken(issued!.token, "should-fail-pw-1"),
    ).rejects.toThrow("invalid or has expired");
  });
});
