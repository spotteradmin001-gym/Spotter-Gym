import "server-only";

import { redirect } from "next/navigation";

import { AuthError, getSessionUser, type SessionUser, type UserRole } from "@/db/queries";

import { readSessionCookie } from "./session-cookie";

/**
 * Route + action guards. The page half redirects (a signed-out page visit has
 * no sensible inline state); the action half throws `AuthError` (caught by the
 * action's result mapping). Pure decision logic is split out so it can be
 * unit-tested without a request context.
 */

export type GuardDecision = "ok" | "login" | "change-password" | "forbidden";

/**
 * Given the resolved user and the roles a route allows, decide what should
 * happen. `mustChangePassword` always wins except on the change-password route
 * itself (the caller passes `allowMustChange` there).
 */
export function decideGuard(
  user: SessionUser | null,
  allowedRoles: readonly UserRole[],
  allowMustChange = false,
): GuardDecision {
  if (!user) return "login";
  if (user.mustChangePassword && !allowMustChange) return "change-password";
  if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return "forbidden";
  }
  return "ok";
}

/** Admin reaches any gym; every other role only its own. */
export function isInGymScope(user: SessionUser, gymId: string): boolean {
  return user.role === "admin" || user.gymId === gymId;
}

async function currentUser(): Promise<SessionUser | null> {
  return getSessionUser(await readSessionCookie());
}

/** Page guard: any signed-in user, past the forced-password-change gate. */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  const decision = decideGuard(user, []);
  if (decision === "login") redirect("/login");
  if (decision === "change-password") redirect("/change-password");
  return user!;
}

async function requireRole(...roles: UserRole[]): Promise<SessionUser> {
  const user = await currentUser();
  const decision = decideGuard(user, roles);
  if (decision === "login") redirect("/login");
  if (decision === "change-password") redirect("/change-password");
  if (decision === "forbidden") redirect("/login");
  return user!;
}

export const requireAdmin = () => requireRole("admin");
export const requireOwner = () => requireRole("owner");
export const requireEmployee = () => requireRole("employee");
export const requireMember = () => requireRole("member");

/**
 * Confirms the user may act within `gymId`. Throws `AuthError` — call it from
 * server actions after the role guard. For an admin any gym passes.
 */
export function requireGymScope(user: SessionUser, gymId: string): void {
  if (!isInGymScope(user, gymId)) {
    throw new AuthError("You don't have access to that gym.");
  }
}

/**
 * Action guard: the Server Action half of "protect everything". A Server Action
 * is its own POST endpoint reachable without clicking through a gated page, so
 * every mutation calls this (or a role variant) first. Throws `AuthError`
 * rather than redirecting.
 */
export async function requireUserForAction(
  ...roles: UserRole[]
): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) throw new AuthError("Please sign in and try again.");
  if (user.mustChangePassword) {
    throw new AuthError("Set a new password before continuing.");
  }
  if (roles.length > 0 && !roles.includes(user.role)) {
    throw new AuthError("You don't have access to that.");
  }
  return user;
}
