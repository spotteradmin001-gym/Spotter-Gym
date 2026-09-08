import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { tempCredentials, users } from "@/db/schema";
import {
  decryptCredential,
  encryptCredential,
  isCredentialVaultEnabled,
} from "@/lib/credential-crypto";

import { AuthError, type SessionUser, type UserRole } from "./auth";

/**
 * The retrievable one-time staff-credential vault (CR-6, Phase C Batch C.2).
 *
 * `storeTempCredential` is called when an account is created or its password is
 * reset by staff; `revealTempCredential` re-shows that password to an
 * authorised staff member; `purgeTempCredential` deletes the row the moment the
 * account holder sets their own password (or on any other password-set path).
 *
 * RBAC (who may see / reset another account's temp password):
 *   - owner's temp password    -> admin only
 *   - employee's temp password -> admin, or that gym's owner
 *   - member                   -> never revealed (token model); reset only
 *   - admin                    -> never, via this path
 *
 * Reveal is additionally blocked once the target's `must_change_password` has
 * flipped to false — by then the stored row should already be purged, but the
 * check is belt-and-braces.
 *
 * Graceful degrade: when `CREDENTIAL_ENC_KEY` is unset the crypto layer returns
 * null, so `storeTempCredential` is a silent no-op and `revealTempCredential`
 * returns null. `purgeTempCredential` still runs — a stale row from a time the
 * key was set must always be removable.
 */

type CredentialTarget = { role: UserRole; gymId: string | null };

/** Can `actor` see `target`'s stored temp password? */
export function canRevealCredential(
  actor: SessionUser,
  target: CredentialTarget,
): boolean {
  if (target.role === "owner") return actor.role === "admin";
  if (target.role === "employee") {
    return (
      actor.role === "admin" ||
      (actor.role === "owner" && actor.gymId === target.gymId)
    );
  }
  // members (token model) and admins are never revealed through the vault.
  return false;
}

/** Can `actor` force a password reset on `target`? */
export function canResetPassword(
  actor: SessionUser,
  target: CredentialTarget,
): boolean {
  if (target.role === "admin") return false;
  if (target.role === "owner") return actor.role === "admin";
  // employee or member
  return (
    actor.role === "admin" ||
    (actor.role === "owner" && actor.gymId === target.gymId)
  );
}

/**
 * Encrypt and upsert a user's temporary password. One row per user, so a second
 * call (a re-reset) overwrites the first and refreshes `created_at`. No-op when
 * the vault is not configured.
 */
export async function storeTempCredential(
  userId: string,
  plaintext: string,
): Promise<void> {
  const sealed = encryptCredential(plaintext);
  if (!sealed) return;

  await db
    .insert(tempCredentials)
    .values({
      userId,
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
    })
    .onConflictDoUpdate({
      target: tempCredentials.userId,
      set: {
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        authTag: sealed.authTag,
        createdAt: new Date(),
      },
    });
}

/**
 * Return a target user's stored temp password in plaintext, or null when there
 * is nothing to show (vault off, no row, password already changed, or the
 * ciphertext no longer decrypts). Throws `AuthError` when `actor` is not
 * allowed to see this target's credential.
 */
export async function revealTempCredential(
  actor: SessionUser,
  targetUserId: string,
): Promise<string | null> {
  const [target] = await db
    .select({
      role: users.role,
      gymId: users.gymId,
      mustChangePassword: users.mustChangePassword,
    })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  if (!target) return null;

  if (!canRevealCredential(actor, { role: target.role as UserRole, gymId: target.gymId })) {
    throw new AuthError("You can't view that account's temporary password.");
  }

  if (!isCredentialVaultEnabled()) return null;
  // First login done -> the convenience window is closed for good.
  if (!target.mustChangePassword) return null;

  const [row] = await db
    .select({
      ciphertext: tempCredentials.ciphertext,
      iv: tempCredentials.iv,
      authTag: tempCredentials.authTag,
    })
    .from(tempCredentials)
    .where(eq(tempCredentials.userId, targetUserId))
    .limit(1);
  if (!row) return null;

  return decryptCredential(row);
}

/**
 * Delete a user's stored temp password. Called from every password-set path
 * (self-service change, token reset, staff reset re-stores a fresh one after).
 * Safe to call when no row exists or the vault is off.
 */
export async function purgeTempCredential(userId: string): Promise<void> {
  await db.delete(tempCredentials).where(eq(tempCredentials.userId, userId));
}
