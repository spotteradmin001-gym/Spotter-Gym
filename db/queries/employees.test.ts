/**
 * Integration test for db/queries/employees.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_emp %`, emails `test_emp_*`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { employees, gyms, members, users } from "@/db/schema";
import {
  EmployeeError,
  createEmployee,
  createPermissionRequest,
  decidePermissionRequest,
  employeeCan,
  getEmployeeIdByUserId,
  listEmployees,
  listPermissionRequests,
  listPermissionsForUser,
  setPermissions,
} from "./employees";
import { createGym } from "./gyms";
import { listMembers } from "./members";

let gymId = "";
let ownerId = "";

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_emp Gym" })).id;
    const [owner] = await db
      .insert(users)
      .values({
        email: "test_emp_owner@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    ownerId = owner!.id;
  });
  afterAll(async () => {
    const empUserIds = (
      await db.select({ id: employees.userId }).from(employees).where(eq(employees.gymId, gymId))
    ).map((r) => r.id);
    await db.delete(members).where(like(members.name, "test_emp %"));
    await db.delete(employees).where(eq(employees.gymId, gymId));
    if (empUserIds.length) await db.delete(users).where(eq(users.id, empUserIds[0]!));
    await db.delete(users).where(like(users.email, "test_emp_%"));
    await db.delete(gyms).where(like(gyms.name, "test_emp %"));
    await closeDb();
  });
}

dbSuite("createEmployee + permissions", () => {
  it("creates a login + roster row and returns the one-time password", async () => {
    const { employee, password } = await createEmployee({
      gymId,
      name: "test_emp Sam",
      email: "test_emp_sam@example.com",
    });
    expect(employee.email).toBe("test_emp_sam@example.com");
    expect(password.length).toBeGreaterThanOrEqual(8);
    expect(employee.permissions).toEqual([]);
  });

  it("setPermissions replaces the whole set; employeeCan reflects it", async () => {
    const [emp] = await listEmployees(gymId);
    await setPermissions({
      gymId,
      employeeId: emp!.id,
      grantedBy: ownerId,
      permissions: [
        { permission: "payment.record", requiresApproval: false },
        { permission: "member.create", requiresApproval: true },
      ],
    });

    const direct = await employeeCan(emp!.userId, "payment.record");
    expect(direct).toEqual({
      allowed: true,
      requiresApproval: false,
      employeeId: emp!.id,
    });
    const gated = await employeeCan(emp!.userId, "member.create");
    expect(gated.allowed && gated.requiresApproval).toBe(true);
    expect(await employeeCan(emp!.userId, "member.edit")).toEqual({ allowed: false });

    // replace with just one
    await setPermissions({
      gymId,
      employeeId: emp!.id,
      grantedBy: ownerId,
      permissions: [{ permission: "member.edit", requiresApproval: false }],
    });
    expect((await employeeCan(emp!.userId, "payment.record")).allowed).toBe(false);
    expect((await employeeCan(emp!.userId, "member.edit")).allowed).toBe(true);
  });

  it("listPermissionsForUser returns exactly the granted subset; getEmployeeIdByUserId resolves", async () => {
    const [emp] = await listEmployees(gymId);
    await setPermissions({
      gymId,
      employeeId: emp!.id,
      grantedBy: ownerId,
      permissions: [
        { permission: "payment.record", requiresApproval: false },
        { permission: "expense.create", requiresApproval: true },
      ],
    });

    const perms = await listPermissionsForUser(emp!.userId);
    expect(new Set(perms.map((p) => p.permission))).toEqual(
      new Set(["payment.record", "expense.create"]),
    );
    expect(perms.find((p) => p.permission === "expense.create")?.requiresApproval).toBe(true);

    expect(await getEmployeeIdByUserId(emp!.userId)).toBe(emp!.id);
    expect(await listPermissionsForUser(ownerId)).toEqual([]); // owner isn't an employee
  });
});

dbSuite("permission requests", () => {
  it("the write happens only on approve, not on request or reject", async () => {
    const [emp] = await listEmployees(gymId);

    const reqId = await createPermissionRequest({
      gymId,
      employeeId: emp!.id,
      actionType: "member.create",
      payload: {
        name: "test_emp Pending",
        phone: "9220000001",
        joinDate: "2026-09-01",
      },
    });

    // not written yet
    expect(
      (await listMembers(gymId, { search: "test_emp Pending" })).length,
    ).toBe(0);
    expect((await listPermissionRequests(gymId, "pending")).some((r) => r.id === reqId)).toBe(true);

    await decidePermissionRequest({
      id: reqId,
      gymId,
      decision: "approved",
      decidedBy: ownerId,
    });

    expect(
      (await listMembers(gymId, { search: "test_emp Pending" })).length,
    ).toBe(1);

    // second decide is a no-op
    await expect(
      decidePermissionRequest({
        id: reqId,
        gymId,
        decision: "rejected",
        decidedBy: ownerId,
      }),
    ).rejects.toBeInstanceOf(EmployeeError);
  });

  it("a rejected request never writes", async () => {
    const [emp] = await listEmployees(gymId);
    const reqId = await createPermissionRequest({
      gymId,
      employeeId: emp!.id,
      actionType: "member.create",
      payload: {
        name: "test_emp Rejected",
        phone: "9220000002",
        joinDate: "2026-09-01",
      },
    });
    await decidePermissionRequest({
      id: reqId,
      gymId,
      decision: "rejected",
      decidedBy: ownerId,
    });
    expect(
      (await listMembers(gymId, { search: "test_emp Rejected" })).length,
    ).toBe(0);
  });
});
