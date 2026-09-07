import "server-only";

import { AuthError, type SessionUser } from "@/db/queries";

import { requireUserForAction } from "./guards";

/**
 * Owner-action guard: confirms the caller is an active owner and returns their
 * gym id. Every owner-portal Server Action starts here, so a gym id is never
 * taken from the form — it's always the owner's own.
 */
export async function requireOwnerGym(): Promise<{
  user: SessionUser;
  gymId: string;
}> {
  const user = await requireUserForAction("owner");
  if (!user.gymId) {
    // Can't happen — users_gym_scope_check guarantees an owner has a gym — but
    // narrow the type and fail loudly rather than pass null downstream.
    throw new AuthError("Your account isn't attached to a gym.");
  }
  return { user, gymId: user.gymId };
}
