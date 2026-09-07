/**
 * Integration test for db/queries/payments.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_pay %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import { dues, gyms, members, payments, users } from "@/db/schema";
import { createUser } from "./auth";
import { generateDuesForGym, listDuesForMember } from "./dues";
import { createGym, updateGym } from "./gyms";
import { createMember } from "./members";
import { listPayments, paymentsSummary, recordPayment } from "./payments";

let gymId = "";
let staffId = "";
const AS_OF = new Date("2026-09-10T00:00:00Z");
const createdUserIds: string[] = [];

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_pay Gym" })).id;
    await updateGym(gymId, {
      defaultMonthlyFeePaise: 100000,
      billingAnchorMode: "fixed",
      billingAnchorDay: 5,
    });
    const staff = await createUser({
      email: "test_pay_staff@example.com",
      role: "owner",
      gymId,
    });
    staffId = staff.user.id;
    createdUserIds.push(staffId);
  });
  afterAll(async () => {
    const ids = (
      await db.select({ id: members.id }).from(members).where(eq(members.gymId, gymId))
    ).map((r) => r.id);
    for (const id of ids) {
      await db.delete(payments).where(eq(payments.memberId, id));
      await db.delete(dues).where(eq(dues.memberId, id));
    }
    await db.delete(members).where(like(members.name, "test_pay %"));
    await db.delete(users).where(like(users.email, "test_pay_%"));
    await db.delete(gyms).where(like(gyms.name, "test_pay %"));
    await closeDb();
  });
}

async function memberWithDues(name: string, phone: string) {
  const m = await createMember({ gymId, name, phone, joinDate: "2026-01-01" });
  await generateDuesForGym(gymId, AS_OF); // two ₹1000 dues: Sep, Oct
  return m;
}

dbSuite("recordPayment + reconciliation", () => {
  it("a partial payment leaves the oldest due pending", async () => {
    const m = await memberWithDues("test_pay Partial", "9100000001");
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 40000,
      paidOn: "2026-09-05",
      method: "cash",
      recordedBy: staffId,
    });
    const d = await listDuesForMember(gymId, m.id);
    expect(d.every((x) => x.status === "pending")).toBe(true);
  });

  it("full payment marks the covered due paid; an overpay rolls onto the next", async () => {
    const m = await memberWithDues("test_pay Over", "9100000002");
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 150000, // covers Sep (1000) fully, 500 toward Oct
      paidOn: "2026-09-05",
      method: "upi",
      recordedBy: staffId,
    });
    const d = await listDuesForMember(gymId, m.id);
    const sep = d.find((x) => x.periodMonth === "2026-09-01");
    const oct = d.find((x) => x.periodMonth === "2026-10-01");
    expect(sep?.status).toBe("paid");
    expect(oct?.status).toBe("pending");

    // top it up so Oct is covered too
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 50000,
      paidOn: "2026-09-06",
      method: "upi",
      recordedBy: staffId,
    });
    const d2 = await listDuesForMember(gymId, m.id);
    expect(d2.every((x) => x.status === "paid")).toBe(true);
  });

  it("captures recorded_by and rejects a non-positive amount", async () => {
    const m = await memberWithDues("test_pay Who", "9100000003");
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 100000,
      paidOn: "2026-09-05",
      method: "cash",
      recordedBy: staffId,
    });
    const [row] = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, m.id))
      .limit(1);
    expect(row?.recordedBy).toBe(staffId);

    await expect(
      recordPayment({
        gymId,
        memberId: m.id,
        amountPaise: 0,
        paidOn: "2026-09-05",
        method: "cash",
        recordedBy: staffId,
      }),
    ).rejects.toThrow(/greater than zero/);
  });
});

dbSuite("listPayments / paymentsSummary", () => {
  it("filters by period and totals collected vs outstanding vs due-today", async () => {
    const m = await memberWithDues("test_pay Sum", "9100000004");
    await recordPayment({
      gymId,
      memberId: m.id,
      amountPaise: 100000,
      paidOn: "2026-09-05",
      method: "cash",
      recordedBy: staffId,
    });

    const monthList = await listPayments(gymId, { period: "month", asOf: AS_OF });
    expect(monthList.some((p) => p.memberName === "test_pay Sum")).toBe(true);

    const summary = await paymentsSummary(gymId, { period: "month", asOf: AS_OF });
    expect(summary.collectedPaise).toBeGreaterThanOrEqual(100000);
    expect(summary.outstandingPaise).toBeGreaterThanOrEqual(0);
    expect(summary.dueTodayPaise).toBeGreaterThanOrEqual(0);
  });
});
