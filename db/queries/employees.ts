import "server-only";

import { and, asc, eq, inArray } from "drizzle-orm";

import { db } from "@/db/client";
import {
  EMPLOYEE_PERMISSIONS,
  employeePermissions,
  employees,
  permissionRequests,
  users,
} from "@/db/schema";

import { AuthError, createUser } from "./auth";
import { addExpense, updateExpense } from "./expenses";
import { storeTempCredential } from "./temp-credentials";
import { createMember, updateMember } from "./members";
import { recordPayment } from "./payments";
import { submitPromotion } from "./promotions";
import { setUserActive } from "./users";

export { EMPLOYEE_PERMISSIONS, PERMISSION_LABELS } from "@/lib/permissions";

export type Permission = (typeof EMPLOYEE_PERMISSIONS)[number];

export class EmployeeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmployeeError";
  }
}

export type EmployeePermission = { permission: Permission; requiresApproval: boolean };

export type Employee = {
  id: string;
  userId: string;
  gymId: string;
  name: string;
  phone: string | null;
  email: string;
  isActive: boolean;
  permissions: EmployeePermission[];
  createdAt: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Roster
// ─────────────────────────────────────────────────────────────────────────────

export async function createEmployee(input: {
  gymId: string;
  name: string;
  phone?: string;
  email: string;
}): Promise<{ employee: Employee; password: string }> {
  const name = input.name.trim();
  if (name.length < 2) throw new EmployeeError("Enter the employee's name.");

  let created;
  try {
    created = await createUser({
      email: input.email,
      role: "employee",
      gymId: input.gymId,
      phone: input.phone,
    });
  } catch (error) {
    if (error instanceof AuthError) throw new EmployeeError(error.message);
    throw error;
  }

  const [row] = await db
    .insert(employees)
    .values({
      gymId: input.gymId,
      userId: created.user.id,
      name,
      phone: input.phone?.trim() || null,
    })
    .returning();

  // Make the one-time password retrievable until the employee sets their own.
  await storeTempCredential(created.user.id, created.password);

  return {
    employee: {
      id: row!.id,
      userId: created.user.id,
      gymId: input.gymId,
      name,
      phone: row!.phone ?? null,
      email: created.user.email,
      isActive: created.user.isActive,
      permissions: [],
      createdAt: row!.createdAt.toISOString(),
    },
    password: created.password,
  };
}

/** The permissions granted to an employee's login (empty if not an employee). */
export async function listPermissionsForUser(
  userId: string,
): Promise<EmployeePermission[]> {
  const rows = await db
    .select({
      permission: employeePermissions.permission,
      requiresApproval: employeePermissions.requiresApproval,
    })
    .from(employeePermissions)
    .innerJoin(employees, eq(employees.id, employeePermissions.employeeId))
    .where(eq(employees.userId, userId));
  return rows.map((r) => ({
    permission: r.permission as Permission,
    requiresApproval: r.requiresApproval,
  }));
}

/** The roster id for an employee's login, or null. */
export async function getEmployeeIdByUserId(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(eq(employees.userId, userId))
    .limit(1);
  return row?.id ?? null;
}

export async function listEmployees(gymId: string): Promise<Employee[]> {
  const rows = await db
    .select({
      employee: employees,
      email: users.email,
      isActive: users.isActive,
    })
    .from(employees)
    .innerJoin(users, eq(users.id, employees.userId))
    .where(eq(employees.gymId, gymId))
    .orderBy(asc(employees.name));

  const employeeIds = rows.map((r) => r.employee.id);
  const perms = employeeIds.length
    ? await db
        .select()
        .from(employeePermissions)
        .where(inArray(employeePermissions.employeeId, employeeIds))
    : [];
  const byEmployee = new Map<string, EmployeePermission[]>();
  for (const p of perms) {
    const list = byEmployee.get(p.employeeId) ?? [];
    list.push({
      permission: p.permission as Permission,
      requiresApproval: p.requiresApproval,
    });
    byEmployee.set(p.employeeId, list);
  }

  return rows.map((r) => ({
    id: r.employee.id,
    userId: r.employee.userId,
    gymId: r.employee.gymId,
    name: r.employee.name,
    phone: r.employee.phone ?? null,
    email: r.email,
    isActive: r.isActive,
    permissions: byEmployee.get(r.employee.id) ?? [],
    createdAt: r.employee.createdAt.toISOString(),
  }));
}

async function requireEmployeeInGym(
  gymId: string,
  employeeId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: employees.id })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.gymId, gymId)))
    .limit(1);
  if (!row) throw new EmployeeError("That employee no longer exists.");
}

/** Replaces the whole permission set for one employee. */
export async function setPermissions(input: {
  gymId: string;
  employeeId: string;
  grantedBy: string;
  permissions: EmployeePermission[];
}): Promise<void> {
  await requireEmployeeInGym(input.gymId, input.employeeId);

  const clean = input.permissions.filter((p) =>
    EMPLOYEE_PERMISSIONS.includes(p.permission),
  );

  await db
    .delete(employeePermissions)
    .where(eq(employeePermissions.employeeId, input.employeeId));

  if (clean.length > 0) {
    await db.insert(employeePermissions).values(
      clean.map((p) => ({
        employeeId: input.employeeId,
        permission: p.permission,
        requiresApproval: p.requiresApproval,
        grantedBy: input.grantedBy,
      })),
    );
  }
}

export async function setEmployeeActive(input: {
  gymId: string;
  employeeId: string;
  isActive: boolean;
}): Promise<void> {
  const [row] = await db
    .select({ userId: employees.userId })
    .from(employees)
    .where(
      and(eq(employees.id, input.employeeId), eq(employees.gymId, input.gymId)),
    )
    .limit(1);
  if (!row) throw new EmployeeError("That employee no longer exists.");
  await setUserActive({ id: row.userId, isActive: input.isActive });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permission checks (used by the employee portal, Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

export type PermissionCheck =
  | { allowed: false }
  | { allowed: true; requiresApproval: boolean; employeeId: string };

export async function employeeCan(
  userId: string,
  permission: Permission,
): Promise<PermissionCheck> {
  const [row] = await db
    .select({
      employeeId: employees.id,
      requiresApproval: employeePermissions.requiresApproval,
    })
    .from(employees)
    .innerJoin(
      employeePermissions,
      and(
        eq(employeePermissions.employeeId, employees.id),
        eq(employeePermissions.permission, permission),
      ),
    )
    .where(eq(employees.userId, userId))
    .limit(1);

  if (!row) return { allowed: false };
  return {
    allowed: true,
    requiresApproval: row.requiresApproval,
    employeeId: row.employeeId,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Approval queue
// ─────────────────────────────────────────────────────────────────────────────

export type RequestStatus = "pending" | "approved" | "rejected";

export type PermissionRequest = {
  id: string;
  gymId: string;
  employeeId: string;
  employeeName: string;
  actionType: Permission;
  payload: Record<string, unknown>;
  status: RequestStatus;
  createdAt: string;
};

export async function createPermissionRequest(input: {
  gymId: string;
  employeeId: string;
  actionType: Permission;
  payload: Record<string, unknown>;
}): Promise<string> {
  const [row] = await db
    .insert(permissionRequests)
    .values({
      gymId: input.gymId,
      employeeId: input.employeeId,
      actionType: input.actionType,
      payload: input.payload,
    })
    .returning({ id: permissionRequests.id });
  return row!.id;
}

export async function listPermissionRequests(
  gymId: string,
  status: RequestStatus = "pending",
): Promise<PermissionRequest[]> {
  const rows = await db
    .select({ request: permissionRequests, employeeName: employees.name })
    .from(permissionRequests)
    .innerJoin(employees, eq(employees.id, permissionRequests.employeeId))
    .where(
      and(
        eq(permissionRequests.gymId, gymId),
        eq(permissionRequests.status, status),
      ),
    )
    .orderBy(asc(permissionRequests.createdAt));

  return rows.map((r) => ({
    id: r.request.id,
    gymId: r.request.gymId,
    employeeId: r.request.employeeId,
    employeeName: r.employeeName,
    actionType: r.request.actionType as Permission,
    payload: (r.request.payload ?? {}) as Record<string, unknown>,
    status: r.request.status as RequestStatus,
    createdAt: r.request.createdAt.toISOString(),
  }));
}

/**
 * Owner decides a pending request. On "approved" the underlying write happens
 * now — never before. Only acts on a still-pending row, so a double click is a
 * no-op.
 */
export async function decidePermissionRequest(input: {
  id: string;
  gymId: string;
  decision: "approved" | "rejected";
  decidedBy: string;
}): Promise<void> {
  const [row] = await db
    .select()
    .from(permissionRequests)
    .where(
      and(
        eq(permissionRequests.id, input.id),
        eq(permissionRequests.gymId, input.gymId),
        eq(permissionRequests.status, "pending"),
      ),
    )
    .limit(1);
  if (!row) throw new EmployeeError("That request is no longer pending.");

  if (input.decision === "approved") {
    await applyRequestedAction(
      input.gymId,
      row.actionType as Permission,
      (row.payload ?? {}) as Record<string, unknown>,
      input.decidedBy,
    );
  }

  await db
    .update(permissionRequests)
    .set({
      status: input.decision,
      decidedBy: input.decidedBy,
      decidedAt: new Date(),
    })
    .where(eq(permissionRequests.id, input.id));
}

async function applyRequestedAction(
  gymId: string,
  actionType: Permission,
  payload: Record<string, unknown>,
  actorUserId: string,
): Promise<void> {
  const s = (k: string) => String(payload[k] ?? "");
  const n = (k: string) =>
    payload[k] == null ? undefined : Number(payload[k]);

  switch (actionType) {
    case "member.create":
      await createMember({
        gymId,
        name: s("name"),
        phone: s("phone"),
        email: s("email") || undefined,
        joinDate: s("joinDate"),
        monthlyFeePaise: n("monthlyFeePaise") ?? null,
        billingAnchorDay: n("billingAnchorDay"),
      });
      return;
    case "member.edit":
      await updateMember(gymId, s("memberId"), {
        name: s("name") || undefined,
        phone: s("phone") || undefined,
        email: (s("email") || null) as string | null,
        billingAnchorDay: n("billingAnchorDay"),
      });
      return;
    case "payment.record":
      await recordPayment({
        gymId,
        memberId: s("memberId"),
        amountPaise: n("amountPaise") ?? 0,
        paidOn: s("paidOn"),
        method: s("method") || "cash",
        note: s("note") || undefined,
        recordedBy: actorUserId,
      });
      return;
    case "expense.create":
      await addExpense({
        gymId,
        label: s("label"),
        amountPaise: n("amountPaise") ?? 0,
        incurredOn: s("incurredOn"),
        categoryId: s("categoryId") || null,
        addedBy: actorUserId,
      });
      return;
    case "expense.edit":
      await updateExpense(gymId, s("expenseId"), {
        label: s("label") || undefined,
        amountPaise: n("amountPaise"),
        incurredOn: s("incurredOn") || undefined,
      });
      return;
    case "promotion.create":
      // The employee's draft (with recipients + any image) already exists; the
      // owner's approval just moves it into the admin queue.
      await submitPromotion({ gymId, promotionId: s("promotionId") });
      return;
    default:
      throw new EmployeeError("That action can't be approved yet.");
  }
}
