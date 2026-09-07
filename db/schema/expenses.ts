import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { employees } from "./employees";
import { gyms } from "./gyms";

/** Free-text expense buckets per gym (Rent, Salaries, Utilities, …). */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("expense_categories_gym_name_unique").on(t.gymId, t.name)],
);

/**
 * A cost that repeats every month (rent, an employee's salary). The monthly
 * materialiser turns each active one into an `expenses` row on `dayOfMonth`.
 */
export const recurringExpenses = pgTable(
  "recurring_expenses",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    categoryId: text("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    dayOfMonth: integer("day_of_month").notNull().default(1),
    linkedEmployeeId: text("linked_employee_id").references(() => employees.id, {
      onDelete: "set null",
    }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("recurring_expenses_amount_check", sql`${t.amountPaise} >= 0`),
    check("recurring_expenses_day_check", sql`${t.dayOfMonth} between 1 and 28`),
    index("recurring_expenses_gym_idx").on(t.gymId),
  ],
);

/**
 * A single incurred cost. `recurringExpenseId` + `periodMonth` are set for rows
 * the materialiser created (unique together, so it's idempotent); both null for
 * an ad-hoc expense.
 */
export const expenses = pgTable(
  "expenses",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    categoryId: text("category_id").references(() => expenseCategories.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull(),
    amountPaise: integer("amount_paise").notNull(),
    incurredOn: date("incurred_on").notNull(),
    recurringExpenseId: text("recurring_expense_id").references(
      () => recurringExpenses.id,
      { onDelete: "set null" },
    ),
    periodMonth: date("period_month"),
    addedBy: text("added_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("expenses_amount_check", sql`${t.amountPaise} >= 0`),
    unique("expenses_recurring_period_unique").on(
      t.recurringExpenseId,
      t.periodMonth,
    ),
    index("expenses_gym_incurred_idx").on(t.gymId, t.incurredOn),
  ],
);
