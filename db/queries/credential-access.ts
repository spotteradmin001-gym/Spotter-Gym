import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/db/client";
import { users } from "@/db/schema";
import { appUrl } from "@/lib/app-url";
import { passwordResetMessage } from "@/lib/wa-templates";

import { writeAudit } from "./audit";
import { createPasswordResetToken, type SessionUser } from "./auth";
import { getGym } from "./gyms";
import { revealTempCredential } from "./temp-credentials";
import { resetUserPassword } from "./users";

/**
 * Staff-facing credential access (CR-6, Phase C Batch C.3): the reveal and
 * reset entry points the admin and owner portals call. Each one runs the
 * RBAC-checked query from C.2 and then writes a `cred.reveal` / `cred.reset`
 * audit row. A blocked attempt throws before any audit row is written.
 */

export type CredentialResetResult = {
  /** The fresh one-time password — shown on screen once. */
  password: string;
  /**
   * A pre-filled WhatsApp message carrying the password-reset LINK (never the
   * raw password), for the "Share via WhatsApp" button on the result.
   */
  shareMessage: string;
  /** Absolute reset link, also shown on the result for copy / paste. */
  resetLink: string;
};

async function targetGymId(targetUserId: string): Promise<string | null> {
  const [row] = await db
    .select({ gymId: users.gymId })
    .from(users)
    .where(eq(users.id, targetUserId))
    .limit(1);
  return row?.gymId ?? null;
}

/**
 * Reveal a target's stored temp password to `actor`. Returns the plaintext, or
 * null when there is nothing to show (vault off, already changed, no row).
 * Throws `AuthError` when `actor` may not see this account's credential — no
 * audit row in that case.
 */
export async function revealCredential(
  actor: SessionUser,
  targetUserId: string,
): Promise<string | null> {
  const password = await revealTempCredential(actor, targetUserId);

  await writeAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    gymId: (await targetGymId(targetUserId)) ?? actor.gymId ?? null,
    action: "cred.reveal",
    targetType: "user",
    targetId: targetUserId,
    meta: { revealed: password !== null },
  });

  return password;
}

/**
 * Force a password reset on a target and return the fresh one-time password
 * plus a share message that links to the reset page. Throws `AuthError` when
 * `actor` may not reset this account — no audit row in that case.
 */
export async function resetCredential(
  actor: SessionUser,
  targetUserId: string,
): Promise<CredentialResetResult> {
  const { user, password } = await resetUserPassword(actor, targetUserId);

  const reset = await createPasswordResetToken(user.email);
  const resetLink = reset
    ? `${appUrl()}/reset-password/${reset.token}`
    : `${appUrl()}/forgot-password`;

  const gym = user.gymId ? await getGym(user.gymId) : null;
  const shareMessage = passwordResetMessage({
    gymName: gym?.name ?? "your gym",
    email: user.email,
    resetLink,
  });

  await writeAudit({
    actorUserId: actor.id,
    actorRole: actor.role,
    gymId: user.gymId ?? actor.gymId ?? null,
    action: "cred.reset",
    targetType: "user",
    targetId: targetUserId,
    meta: { targetRole: user.role },
  });

  return { password, shareMessage, resetLink };
}
