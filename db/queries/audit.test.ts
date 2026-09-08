/**
 * Integration test for db/queries/audit.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: action `test_audit.*`,
 * gym / user name prefix `test_staff_activity`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { audits, employees, gyms, users } from "@/db/schema";
import { listAudits, listStaffActivity, writeAudit } from "./audit";
import { createGym } from "./gyms";

let gymId = "";
let actorId = "";

if (process.env.DATABASE_URL) {
  afterAll(async () => {
    await db.delete(audits).where(like(audits.action, "test_audit.%"));
    await db.delete(users).where(like(users.email, "test_audit_%"));
    await db.delete(gyms).where(like(gyms.name, "test_audit %"));
    await closeDb();
  });
}

dbSuite("audit", () => {
  it("writes an entry and lists it, gym-scoped, with the actor email joined", async () => {
    gymId = (await createGym({ name: "test_audit Gym" })).id;
    const [u] = await db
      .insert(users)
      .values({
        email: "test_audit_actor@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    actorId = u!.id;

    await writeAudit({
      actorUserId: actorId,
      actorRole: "owner",
      gymId,
      action: "test_audit.payment.record",
      targetType: "member",
      targetId: "m-123",
      meta: { amountPaise: 100000 },
    });

    const gymEntries = await listAudits({ gymId, limit: 50 });
    const mine = gymEntries.find((e) => e.action === "test_audit.payment.record");
    expect(mine).toBeTruthy();
    expect(mine?.actorEmail).toBe("test_audit_actor@example.com");
    expect(mine?.meta).toEqual({ amountPaise: 100000 });

    // a different gym doesn't see it
    const other = (await createGym({ name: "test_audit Other" })).id;
    const otherEntries = await listAudits({ gymId: other, limit: 50 });
    expect(otherEntries.some((e) => e.action === "test_audit.payment.record")).toBe(false);
  });

  it("never throws, even on a bad actor id", async () => {
    await expect(
      writeAudit({
        actorUserId: "00000000-0000-0000-0000-000000000000",
        actorRole: "owner",
        gymId,
        action: "test_audit.noop",
        targetType: "none",
      }),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// listStaffActivity (CR-5)
// ─────────────────────────────────────────────────────────────────────────────

let saGymA = "";
let saGymB = "";
let saEmp1 = "";
let saEmp2 = "";
let saOwner = "";

const daysAgo = (n: number): Date => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
};

async function seedAudit(row: {
  gymId: string;
  actorUserId: string | null;
  actorRole: string;
  action: string;
  createdAt?: Date;
  meta?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(audits).values({
    gymId: row.gymId,
    actorUserId: row.actorUserId,
    actorRole: row.actorRole,
    action: row.action,
    targetType: "member",
    targetId: "m-1",
    meta: row.meta ?? null,
    ...(row.createdAt ? { createdAt: row.createdAt } : {}),
  });
}

if (process.env.DATABASE_URL) {
  afterAll(async () => {
    for (const g of [saGymA, saGymB].filter(Boolean)) {
      await db.delete(audits).where(eq(audits.gymId, g));
    }
    await db.delete(users).where(like(users.email, "test_staff_activity_%"));
    await db.delete(gyms).where(like(gyms.name, "test_staff_activity %"));
  });
}

dbSuite("listStaffActivity", () => {
  it("sets up two gyms with employee and owner actors", async () => {
    saGymA = (await createGym({ name: "test_staff_activity A" })).id;
    saGymB = (await createGym({ name: "test_staff_activity B" })).id;

    const mk = async (email: string, role: string, gid: string) => {
      const [u] = await db
        .insert(users)
        .values({
          email,
          role,
          gymId: gid,
          passwordHash: "x:y",
          mustChangePassword: false,
        })
        .returning({ id: users.id });
      return u!.id;
    };

    saEmp1 = await mk("test_staff_activity_e1@example.com", "employee", saGymA);
    saEmp2 = await mk("test_staff_activity_e2@example.com", "employee", saGymA);
    saOwner = await mk("test_staff_activity_o@example.com", "owner", saGymA);

    await db.insert(employees).values([
      { gymId: saGymA, userId: saEmp1, name: "Asha Staff" },
      { gymId: saGymA, userId: saEmp2, name: "Ravi Staff" },
    ]);
  });

  it("returns only this gym's allow-listed employee actions, newest first", async () => {
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp1,
      actorRole: "employee",
      action: "member.create",
      createdAt: daysAgo(2),
    });
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp1,
      actorRole: "employee",
      action: "payment.record",
      createdAt: daysAgo(1),
      meta: { amountPaise: 250000, method: "upi" },
    });

    const rows = await listStaffActivity(saGymA, { period: "month" });
    const actions = rows.map((r) => r.action);
    expect(actions).toEqual(["payment.record", "member.create"]);

    const payment = rows.find((r) => r.action === "payment.record");
    expect(payment?.actorName).toBe("Asha Staff");
    expect(payment?.actorEmail).toBe("test_staff_activity_e1@example.com");
    expect(payment?.amountPaise).toBe(250000);
    expect(payment?.actorUserId).toBe(saEmp1);
  });

  it("excludes rows from other gyms", async () => {
    await seedAudit({
      gymId: saGymB,
      actorUserId: saEmp1,
      actorRole: "employee",
      action: "payment.record",
      createdAt: daysAgo(1),
    });
    const rows = await listStaffActivity(saGymA, { period: "month" });
    expect(rows.every((r) => r.actorUserId === saEmp1 || r.actorUserId === saEmp2)).toBe(true);
    const b = await listStaffActivity(saGymB, { period: "month" });
    expect(b).toHaveLength(1);
  });

  it("excludes non-employee actors", async () => {
    await seedAudit({
      gymId: saGymA,
      actorUserId: saOwner,
      actorRole: "owner",
      action: "payment.record",
      createdAt: daysAgo(1),
    });
    await seedAudit({
      gymId: saGymA,
      actorUserId: null,
      actorRole: "admin",
      action: "member.create",
      createdAt: daysAgo(1),
    });
    const rows = await listStaffActivity(saGymA, { period: "month" });
    expect(rows.some((r) => r.actorUserId === saOwner)).toBe(false);
    expect(rows.every((r) => r.action !== "member.create" || r.actorName != null)).toBe(true);
  });

  it("excludes actions outside the allow-list", async () => {
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp1,
      actorRole: "employee",
      action: "employee.create",
      createdAt: daysAgo(1),
    });
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp1,
      actorRole: "employee",
      action: "gym.waha_session",
      createdAt: daysAgo(1),
    });
    const rows = await listStaffActivity(saGymA, { period: "month" });
    expect(rows.some((r) => r.action === "employee.create")).toBe(false);
    expect(rows.some((r) => r.action === "gym.waha_session")).toBe(false);
  });

  it("honours the reporting period bounds", async () => {
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp2,
      actorRole: "employee",
      action: "expense.create",
      createdAt: daysAgo(200),
    });
    await seedAudit({
      gymId: saGymA,
      actorUserId: saEmp2,
      actorRole: "employee",
      action: "expense.edit",
      createdAt: daysAgo(800),
    });

    const month = await listStaffActivity(saGymA, { period: "month" });
    expect(month.some((r) => r.action === "expense.create")).toBe(false);

    const year = await listStaffActivity(saGymA, { period: "year" });
    expect(year.some((r) => r.action === "expense.create")).toBe(true);
    expect(year.some((r) => r.action === "expense.edit")).toBe(false);
  });

  it("filters to one employee when asked", async () => {
    const all = await listStaffActivity(saGymA, { period: "year" });
    const both = new Set(all.map((r) => r.actorUserId));
    expect(both.has(saEmp1)).toBe(true);
    expect(both.has(saEmp2)).toBe(true);

    const justEmp1 = await listStaffActivity(saGymA, {
      period: "year",
      employeeUserId: saEmp1,
    });
    expect(justEmp1.length).toBeGreaterThan(0);
    expect(justEmp1.every((r) => r.actorUserId === saEmp1)).toBe(true);
  });
});
