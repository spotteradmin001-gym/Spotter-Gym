/**
 * Integration test for db/queries/overview.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_ov %`. Builds one fixture gym with known numbers and asserts every
 * metric.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { dues, expenses, gyms, members, payments, users } from "@/db/schema";
import { generateDuesForGym } from "./dues";
import { addExpense } from "./expenses";
import { createGym, updateGym } from "./gyms";
import { createMember, setMemberStatus } from "./members";
import { ownerOverview } from "./overview";
import { recordPayment } from "./payments";

let gymId = "";
let staffId = "";
const AS_OF = new Date("2026-09-20T00:00:00Z");

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_ov Gym" })).id;
    await updateGym(gymId, {
      defaultMonthlyFeePaise: 100000,
      billingAnchorMode: "fixed",
      billingAnchorDay: 5,
    });
    const [u] = await db
      .insert(users)
      .values({
        email: "test_ov_owner@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    staffId = u!.id;

    // A: joined this month, paid → renewed
    const a = await createMember({
      gymId,
      name: "test_ov Renewed",
      phone: "9400000001",
      joinDate: "2026-09-02",
    });
    // B: joined 2 months ago, unpaid + due passed → not renewed
    const b = await createMember({
      gymId,
      name: "test_ov Lapsed",
      phone: "9400000002",
      joinDate: "2026-07-10",
    });
    // C: inactive — excluded from active + not-renewed
    const c = await createMember({
      gymId,
      name: "test_ov Gone",
      phone: "9400000003",
      joinDate: "2026-07-10",
    });
    await setMemberStatus(gymId, c.id, "inactive");

    await generateDuesForGym(gymId, AS_OF);
    await recordPayment({
      gymId,
      memberId: a.id,
      amountPaise: 200000, // covers Sep + Oct
      paidOn: "2026-09-05",
      method: "cash",
      recordedBy: staffId,
    });
    await addExpense({
      gymId,
      label: "test_ov Rent",
      amountPaise: 150000,
      incurredOn: "2026-09-01",
      addedBy: staffId,
    });
    void b;
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
    await db.delete(members).where(like(members.name, "test_ov %"));
    await db.delete(users).where(like(users.email, "test_ov_%"));
    await db.delete(gyms).where(like(gyms.name, "test_ov %"));
    await closeDb();
  });
}

dbSuite("ownerOverview", () => {
  it("computes profit, outstanding, due-today and member stats", async () => {
    const o = await ownerOverview(gymId, AS_OF);

    // Sep income 200000 − Sep expense 150000
    expect(o.monthProfitPaise).toBe(50000);
    // total non-waived dues − total paid. A: 2×100000 paid 200000 → 0.
    // B: Sep+Oct dues 200000, paid 0. C inactive still has dues... generated
    // before going inactive? No — inactive at generation time is skipped, but
    // C was set inactive AFTER createMember and BEFORE generate → skipped.
    expect(o.outstandingPaise).toBe(200000);
    // due today = pending dues with dueDate <= 2026-09-20: B's Sep due (the 5th)
    expect(o.dueTodayPaise).toBe(100000);

    expect(o.members.activeTotal).toBe(2); // A, B (C inactive)
    expect(o.members.joinedThisMonth).toBe(1); // A
    expect(o.members.joinedLast3Months).toBe(3); // A, B, C — a join is a join
    expect(o.members.notRenewedThisMonth).toBe(1); // B (Sep due passed, unpaid)
    expect(o.members.notRenewedLast3Months).toBe(1); // B
  });
});
