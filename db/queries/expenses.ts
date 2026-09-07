import "server-only";

import { and, asc, between, desc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import {
  employees,
  expenseCategories,
  expenses,
  gyms,
  recurringExpenses,
} from "@/db/schema";
import { dueDateFor, periodMonthOf, reportRange, type RangeKind } from "@/lib/billing";

export class ExpenseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpenseError";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Categories
// ─────────────────────────────────────────────────────────────────────────────

export type ExpenseCategory = { id: string; name: string };

export async function listCategories(gymId: string): Promise<ExpenseCategory[]> {
  const rows = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(eq(expenseCategories.gymId, gymId))
    .orderBy(asc(expenseCategories.name));
  return rows;
}

export async function addCategory(gymId: string, name: string): Promise<ExpenseCategory> {
  const clean = name.trim();
  if (clean.length < 2) throw new ExpenseError("Enter a category name.");
  const [dupe] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.gymId, gymId), eq(expenseCategories.name, clean)))
    .limit(1);
  if (dupe) throw new ExpenseError("That category already exists.");
  const [row] = await db
    .insert(expenseCategories)
    .values({ gymId, name: clean })
    .returning({ id: expenseCategories.id, name: expenseCategories.name });
  return row!;
}

export async function deleteCategory(gymId: string, id: string): Promise<void> {
  await db
    .delete(expenseCategories)
    .where(and(eq(expenseCategories.id, id), eq(expenseCategories.gymId, gymId)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Recurring
// ─────────────────────────────────────────────────────────────────────────────

export type RecurringExpense = {
  id: string;
  label: string;
  amountPaise: number;
  dayOfMonth: number;
  categoryId: string | null;
  categoryName: string | null;
  linkedEmployeeId: string | null;
  linkedEmployeeName: string | null;
  isActive: boolean;
};

function validAmount(paise: number): void {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new ExpenseError("The amount must be a whole number of paise.");
  }
}

export async function listRecurringExpenses(
  gymId: string,
): Promise<RecurringExpense[]> {
  const rows = await db
    .select({
      r: recurringExpenses,
      categoryName: expenseCategories.name,
      employeeName: employees.name,
    })
    .from(recurringExpenses)
    .leftJoin(
      expenseCategories,
      eq(expenseCategories.id, recurringExpenses.categoryId),
    )
    .leftJoin(employees, eq(employees.id, recurringExpenses.linkedEmployeeId))
    .where(eq(recurringExpenses.gymId, gymId))
    .orderBy(asc(recurringExpenses.label));

  return rows.map((row) => ({
    id: row.r.id,
    label: row.r.label,
    amountPaise: row.r.amountPaise,
    dayOfMonth: row.r.dayOfMonth,
    categoryId: row.r.categoryId ?? null,
    categoryName: row.categoryName ?? null,
    linkedEmployeeId: row.r.linkedEmployeeId ?? null,
    linkedEmployeeName: row.employeeName ?? null,
    isActive: row.r.isActive,
  }));
}

export async function addRecurringExpense(input: {
  gymId: string;
  label: string;
  amountPaise: number;
  dayOfMonth: number;
  categoryId?: string | null;
  linkedEmployeeId?: string | null;
}): Promise<void> {
  const label = input.label.trim();
  if (label.length < 2) throw new ExpenseError("Enter a label.");
  validAmount(input.amountPaise);
  if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
    throw new ExpenseError("Day of month must be between 1 and 28.");
  }
  await db.insert(recurringExpenses).values({
    gymId: input.gymId,
    label,
    amountPaise: input.amountPaise,
    dayOfMonth: input.dayOfMonth,
    categoryId: input.categoryId || null,
    linkedEmployeeId: input.linkedEmployeeId || null,
  });
}

export async function setRecurringActive(
  gymId: string,
  id: string,
  isActive: boolean,
): Promise<void> {
  await db
    .update(recurringExpenses)
    .set({ isActive })
    .where(
      and(eq(recurringExpenses.id, id), eq(recurringExpenses.gymId, gymId)),
    );
}

export async function deleteRecurringExpense(
  gymId: string,
  id: string,
): Promise<void> {
  await db
    .delete(recurringExpenses)
    .where(
      and(eq(recurringExpenses.id, id), eq(recurringExpenses.gymId, gymId)),
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// One-off + listing
// ─────────────────────────────────────────────────────────────────────────────

export type Expense = {
  id: string;
  label: string;
  amountPaise: number;
  incurredOn: string;
  categoryName: string | null;
  recurring: boolean;
};

export async function addExpense(input: {
  gymId: string;
  label: string;
  amountPaise: number;
  incurredOn: string;
  categoryId?: string | null;
  addedBy: string;
}): Promise<void> {
  const label = input.label.trim();
  if (label.length < 2) throw new ExpenseError("Enter a label.");
  validAmount(input.amountPaise);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.incurredOn)) {
    throw new ExpenseError("Enter a valid date.");
  }
  await db.insert(expenses).values({
    gymId: input.gymId,
    label,
    amountPaise: input.amountPaise,
    incurredOn: input.incurredOn,
    categoryId: input.categoryId || null,
    addedBy: input.addedBy,
  });
}

export async function updateExpense(
  gymId: string,
  id: string,
  patch: Partial<{
    label: string;
    amountPaise: number;
    incurredOn: string;
    categoryId: string | null;
  }>,
): Promise<void> {
  const set: Partial<typeof expenses.$inferInsert> = {};
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (label.length < 2) throw new ExpenseError("Enter a label.");
    set.label = label;
  }
  if (patch.amountPaise !== undefined) {
    validAmount(patch.amountPaise);
    set.amountPaise = patch.amountPaise;
  }
  if (patch.incurredOn !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.incurredOn)) {
      throw new ExpenseError("Enter a valid date.");
    }
    set.incurredOn = patch.incurredOn;
  }
  if (patch.categoryId !== undefined) set.categoryId = patch.categoryId || null;
  if (Object.keys(set).length === 0) return;

  const rows = await db
    .update(expenses)
    .set(set)
    .where(and(eq(expenses.id, id), eq(expenses.gymId, gymId)))
    .returning({ id: expenses.id });
  if (rows.length === 0) throw new ExpenseError("That expense no longer exists.");
}

export async function deleteExpense(gymId: string, id: string): Promise<void> {
  await db
    .delete(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.gymId, gymId)));
}

export async function listExpenses(
  gymId: string,
  opts: { period?: RangeKind; asOf?: Date } = {},
): Promise<Expense[]> {
  const where = [eq(expenses.gymId, gymId)];
  if (opts.period) {
    const { from, to } = reportRange(opts.period, opts.asOf ?? new Date());
    where.push(between(expenses.incurredOn, from, to));
  }
  const rows = await db
    .select({ e: expenses, categoryName: expenseCategories.name })
    .from(expenses)
    .leftJoin(expenseCategories, eq(expenseCategories.id, expenses.categoryId))
    .where(and(...where))
    .orderBy(desc(expenses.incurredOn), desc(expenses.createdAt));

  return rows.map((row) => ({
    id: row.e.id,
    label: row.e.label,
    amountPaise: row.e.amountPaise,
    incurredOn: row.e.incurredOn,
    categoryName: row.categoryName ?? null,
    recurring: row.e.recurringExpenseId != null,
  }));
}

export async function expensesSummary(
  gymId: string,
  opts: { period?: RangeKind; asOf?: Date } = {},
): Promise<{ totalPaise: number }> {
  const { from, to } = reportRange(opts.period ?? "month", opts.asOf ?? new Date());
  const [row] = await db
    .select({ v: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)::bigint` })
    .from(expenses)
    .where(and(eq(expenses.gymId, gymId), between(expenses.incurredOn, from, to)));
  return { totalPaise: Number(row!.v) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Monthly materialisation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Turns each active recurring expense into a concrete `expenses` row for the
 * month containing `asOf`. Idempotent via unique(recurring_expense_id,
 * period_month). Returns how many rows were created.
 */
export async function materializeRecurringForGym(
  gymId: string,
  asOf: Date = new Date(),
): Promise<{ created: number }> {
  const periodMonth = periodMonthOf(asOf);
  const active = await db
    .select()
    .from(recurringExpenses)
    .where(
      and(eq(recurringExpenses.gymId, gymId), eq(recurringExpenses.isActive, true)),
    );
  if (active.length === 0) return { created: 0 };

  const inserted = await db
    .insert(expenses)
    .values(
      active.map((r) => ({
        gymId,
        categoryId: r.categoryId,
        label: r.label,
        amountPaise: r.amountPaise,
        incurredOn: dueDateFor(periodMonth, r.dayOfMonth),
        recurringExpenseId: r.id,
        periodMonth,
      })),
    )
    .onConflictDoNothing({
      target: [expenses.recurringExpenseId, expenses.periodMonth],
    })
    .returning({ id: expenses.id });

  return { created: inserted.length };
}

export async function materializeRecurringForAllGyms(
  asOf: Date = new Date(),
): Promise<{ gyms: number; created: number }> {
  const active = await db
    .select({ id: gyms.id })
    .from(gyms)
    .where(eq(gyms.isActive, true));
  let created = 0;
  for (const gym of active) {
    created += (await materializeRecurringForGym(gym.id, asOf)).created;
  }
  return { gyms: active.length, created };
}
