/**
 * Integration test for db/queries/pnl.ts against the Neon `preview` branch.
 * Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name `test_pnl %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { dues, expenses, gyms, members, payments, users } from "@/db/schema";
import { addExpense, expensesSummary } from "./expenses";
import { createGym, updateGym } from "./gyms";
import { createMember } from "./members";
import { listPayments, recordPayment } from "./payments";
import { monthlyPnl, sumPnl } from "./pnl";

let gymId = "";
let staffId = "";
const AS_OF = new Date("2026-09-15T00:00:00Z");

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_pnl Gym" })).id;
    await updateGym(gymId, { defaultMonthlyFeePaise: 100000 });
    const [u] = await db
      .insert(users)
      .values({
        email: "test_pnl_owner@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    staffId = u!.id;

    const m = await createMember({
      gymId,
      name: "test_pnl Member",
      phone: "9300000001",
      joinDate: "2026-01-01",
    });
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 250000,
      paidOn: "2026-09-05",
      method: "cash",
      recordedBy: staffId,
    });
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 100000,
      paidOn: "2026-08-05",
      method: "upi",
      recordedBy: staffId,
    });
    await addExpense({
      gymId,
      label: "test_pnl Rent",
      amountPaise: 300000,
      incurredOn: "2026-09-01",
      addedBy: staffId,
    });
  });
  afterAll(async () => {
    const ids = (
      await db.select({ id: members.id }).from(members).where(eq(members.gymId, gymId))
    ).map((r) => r.id);
    for (const id of ids) {
      await db.delete(payments).where(eq(payments.memberId, id));
      await db.delete(dues).where(eq(dues.memberId, id));
    }
    await db.delete(expenses).where(eq(expenses.gymId, gymId));
    await db.delete(members).where(like(members.name, "test_pnl %"));
    await db.delete(users).where(like(users.email, "test_pnl_%"));
    await db.delete(gyms).where(like(gyms.name, "test_pnl %"));
    await closeDb();
  });
}

dbSuite("monthlyPnl", () => {
  it("splits income and expense by calendar month and nets them", async () => {
    const rows = await monthlyPnl(gymId, { months: 3, asOf: AS_OF });
    expect(rows.map((r) => r.period)).toEqual(["2026-07", "2026-08", "2026-09"]);

    const sep = rows.find((r) => r.period === "2026-09")!;
    const aug = rows.find((r) => r.period === "2026-08")!;
    expect(sep.incomePaise).toBe(250000);
    expect(sep.expensePaise).toBe(300000);
    expect(sep.netPaise).toBe(-50000);
    expect(aug.incomePaise).toBe(100000);
    expect(aug.expensePaise).toBe(0);
  });

  it("totals reconcile with the payments list and expenses summary", async () => {
    const rows = await monthlyPnl(gymId, { months: 12, asOf: AS_OF });
    const totals = sumPnl(rows);

    const pays = await listPayments(gymId, { period: "year", asOf: AS_OF });
    const paidTotal = pays.reduce((s, p) => s + p.amountPaise, 0);
    const exp = await expensesSummary(gymId, { period: "year", asOf: AS_OF });

    expect(totals.incomePaise).toBe(paidTotal);
    expect(totals.expensePaise).toBe(exp.totalPaise);
    expect(totals.netPaise).toBe(paidTotal - exp.totalPaise);
  });
});
