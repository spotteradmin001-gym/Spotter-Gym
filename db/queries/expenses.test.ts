/**
 * Integration test for db/queries/expenses.ts against the Neon `preview`
 * branch. Skipped when DATABASE_URL is unset. FIND-MY-FIXTURE: gym name
 * `test_exp %`.
 */
import { eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dbSuite = process.env.DATABASE_URL ? describe : describe.skip;

import { closeDb, db } from "@/db/client";
import {
  expenseCategories,
  expenses,
  gyms,
  recurringExpenses,
  users,
} from "@/db/schema";
import { createGym } from "./gyms";
import {
  ExpenseError,
  addCategory,
  addExpense,
  addRecurringExpense,
  expensesSummary,
  listExpenses,
  listRecurringExpenses,
  materializeRecurringForGym,
} from "./expenses";

let gymId = "";
let staffId = "";
const AS_OF = new Date("2026-09-10T00:00:00Z");

if (process.env.DATABASE_URL) {
  beforeAll(async () => {
    gymId = (await createGym({ name: "test_exp Gym" })).id;
    const [u] = await db
      .insert(users)
      .values({
        email: "test_exp_owner@example.com",
        role: "owner",
        gymId,
        passwordHash: "x:y",
        mustChangePassword: false,
      })
      .returning({ id: users.id });
    staffId = u!.id;
  });
  afterAll(async () => {
    await db.delete(expenses).where(eq(expenses.gymId, gymId));
    await db.delete(recurringExpenses).where(eq(recurringExpenses.gymId, gymId));
    await db.delete(expenseCategories).where(eq(expenseCategories.gymId, gymId));
    await db.delete(users).where(like(users.email, "test_exp_%"));
    await db.delete(gyms).where(like(gyms.name, "test_exp %"));
    await closeDb();
  });
}

dbSuite("categories + ad-hoc expenses", () => {
  it("adds a category, rejects a duplicate, and an ad-hoc expense", async () => {
    const cat = await addCategory(gymId, "Utilities");
    await expect(addCategory(gymId, "Utilities")).rejects.toBeInstanceOf(ExpenseError);

    await addExpense({
      gymId,
      label: "Electricity bill",
      amountPaise: 45000,
      incurredOn: "2026-09-08",
      categoryId: cat.id,
      addedBy: staffId,
    });

    const list = await listExpenses(gymId, { period: "month", asOf: AS_OF });
    const bill = list.find((x) => x.label === "Electricity bill");
    expect(bill?.amountPaise).toBe(45000);
    expect(bill?.categoryName).toBe("Utilities");
    expect(bill?.recurring).toBe(false);
  });
});

dbSuite("recurring materialisation", () => {
  it("materialises each active recurring once per month and totals it", async () => {
    await addRecurringExpense({
      gymId,
      label: "Rent",
      amountPaise: 3000000,
      dayOfMonth: 1,
    });
    await addRecurringExpense({
      gymId,
      label: "Inactive line",
      amountPaise: 100,
      dayOfMonth: 1,
    });
    const recs = await listRecurringExpenses(gymId);
    const inactive = recs.find((r) => r.label === "Inactive line")!;
    await db
      .update(recurringExpenses)
      .set({ isActive: false })
      .where(eq(recurringExpenses.id, inactive.id));

    const first = await materializeRecurringForGym(gymId, AS_OF);
    expect(first.created).toBe(1); // only Rent

    const second = await materializeRecurringForGym(gymId, AS_OF);
    expect(second.created).toBe(0); // idempotent

    const list = await listExpenses(gymId, { period: "month", asOf: AS_OF });
    const rent = list.find((x) => x.label === "Rent");
    expect(rent?.recurring).toBe(true);
    expect(rent?.incurredOn).toBe("2026-09-01");

    const summary = await expensesSummary(gymId, { period: "month", asOf: AS_OF });
    expect(summary.totalPaise).toBeGreaterThanOrEqual(3000000 + 45000);
  });
});
