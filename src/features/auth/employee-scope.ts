import "server-only";

import {
  AuthError,
  employeeCan,
  getEmployeeIdByUserId,
  getSessionUser,
  type SessionUser,
} from "@/db/queries";
import type { Permission } from "@/lib/permissions";

import { readSessionCookie } from "./session-cookie";

export type EmployeeContext = {
  user: SessionUser;
  gymId: string;
  employeeId: string;
};

/** Confirms an active employee session and returns their gym + roster id. */
export async function requireEmployeeContext(): Promise<EmployeeContext> {
  const user = await getSessionUser(await readSessionCookie());
  if (!user || user.role !== "employee") {
    throw new AuthError("Please sign in and try again.");
  }
  if (user.mustChangePassword) {
    throw new AuthError("Set a new password before continuing.");
  }
  if (!user.gymId) {
    throw new AuthError("Your account isn't attached to a gym.");
  }
  const employeeId = await getEmployeeIdByUserId(user.id);
  if (!employeeId) throw new AuthError("Your employee record is missing.");
  return { user, gymId: user.gymId, employeeId };
}

export type PermissionGate = {
  ctx: EmployeeContext;
  /** true when this permission is granted but the owner must approve each use. */
  requiresApproval: boolean;
};

/**
 * Action guard for one capability. Throws `AuthError` when the employee doesn't
 * have it. When they do but it's approval-gated, `requiresApproval` is true and
 * the caller must file a `permission_request` instead of writing.
 */
export async function requireEmployeePermission(
  permission: Permission,
): Promise<PermissionGate> {
  const ctx = await requireEmployeeContext();
  const check = await employeeCan(ctx.user.id, permission);
  if (!check.allowed) {
    throw new AuthError("You don't have permission for that.");
  }
  return { ctx, requiresApproval: check.requiresApproval };
}
