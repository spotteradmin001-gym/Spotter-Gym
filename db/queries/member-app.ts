import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { memberActivationTokens, members, users } from "@/db/schema";
import { hashPassword, isPasswordStrongEnough, MIN_PASSWORD_LENGTH } from "@/src/features/auth/password";

import { AuthError, createSession } from "./auth";
import type { ProfileField } from "./config";

const ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Issues an activation link for a member who has no login yet. The gym must
 * own the member. Earlier unused tokens for the member are dropped.
 */
export async function createMemberActivationToken(
  gymId: string,
  memberId: string,
): Promise<{
  token: string;
  member: { id: string; name: string; email: string | null; phone: string };
}> {
  const [member] = await db
    .select()
    .from(members)
    .where(and(eq(members.id, memberId), eq(members.gymId, gymId)))
    .limit(1);
  if (!member) throw new AuthError("That member no longer exists.");
  if (member.userId) throw new AuthError("This member already has a login.");

  await db
    .delete(memberActivationTokens)
    .where(eq(memberActivationTokens.memberId, memberId));

  const token = randomBytes(32).toString("base64url");
  await db.insert(memberActivationTokens).values({
    memberId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ACTIVATION_TTL_MS),
  });

  return {
    token,
    member: {
      id: member.id,
      name: member.name,
      email: member.email ?? null,
      phone: member.phone,
    },
  };
}

/**
 * Consumes an activation token: creates the member's `users` row (role
 * 'member'), links it, marks the token used, and opens a session. One generic
 * `AuthError` for an unknown / expired / used token or an already-activated
 * member.
 */
export async function activateMember(
  rawToken: string,
  input: { email: string; password: string },
): Promise<{ userId: string; sessionId: string; expiresAt: Date }> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new AuthError("Enter a valid email address.");
  }
  if (!isPasswordStrongEnough(input.password)) {
    throw new AuthError(
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    );
  }

  const [row] = await db
    .select()
    .from(memberActivationTokens)
    .where(eq(memberActivationTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
    throw new AuthError("This activation link is invalid or has expired.");
  }

  const [member] = await db
    .select()
    .from(members)
    .where(eq(members.id, row.memberId))
    .limit(1);
  if (!member || member.userId) {
    throw new AuthError("This activation link is invalid or has expired.");
  }

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existingEmail) {
    throw new AuthError("An account with that email already exists.");
  }

  const [user] = await db
    .insert(users)
    .values({
      email,
      phone: member.phone,
      role: "member",
      gymId: member.gymId,
      passwordHash: hashPassword(input.password),
      mustChangePassword: false,
    })
    .returning({ id: users.id });

  await db
    .update(members)
    .set({ userId: user!.id, email, updatedAt: new Date() })
    .where(eq(members.id, member.id));
  await db
    .update(memberActivationTokens)
    .set({ usedAt: new Date() })
    .where(eq(memberActivationTokens.id, row.id));

  const session = await createSession(user!.id);
  return { userId: user!.id, sessionId: session.sessionId, expiresAt: session.expiresAt };
}

/** Read-only lookup for the activation page — does not consume the token. */
export async function peekActivationToken(
  rawToken: string,
): Promise<{ memberName: string; memberEmail: string | null } | null> {
  const [row] = await db
    .select({ member: members })
    .from(memberActivationTokens)
    .innerJoin(members, eq(members.id, memberActivationTokens.memberId))
    .where(eq(memberActivationTokens.tokenHash, hashToken(rawToken)))
    .limit(1);
  if (!row) return null;
  return { memberName: row.member.name, memberEmail: row.member.email ?? null };
}

/** True when every required profile field has a non-empty answer. Pure. */
export function profileComplete(
  profile: Record<string, string>,
  fields: ProfileField[],
): boolean {
  return fields
    .filter((f) => f.required)
    .every((f) => (profile[f.key] ?? "").trim().length > 0);
}

/** For the "does this member still need a login?" check on the staff detail page. */
export async function memberHasPendingActivation(
  memberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: memberActivationTokens.id })
    .from(memberActivationTokens)
    .where(
      and(
        eq(memberActivationTokens.memberId, memberId),
        isNull(memberActivationTokens.usedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
}
