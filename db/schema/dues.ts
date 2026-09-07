import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { gyms } from "./gyms";
import { members } from "./members";

/**
 * Monthly membership dues (Phase 3 Batch 3.3).
 *
 * One row per member per billing period. `periodMonth` is the first of the
 * month the due belongs to; `dueDate` is when it's actually payable (the
 * member's or the gym's billing anchor day). `amountDuePaise` is the resolved
 * fee captured at generation time, so a later fee change doesn't rewrite
 * history. The generator is idempotent via `unique(member_id, period_month)`.
 */
export const dues = pgTable(
  "dues",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    periodMonth: date("period_month").notNull(),
    amountDuePaise: integer("amount_due_paise").notNull(),
    dueDate: date("due_date").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("dues_member_period_unique").on(t.memberId, t.periodMonth),
    check("dues_status_check", sql`${t.status} in ('pending', 'paid', 'waived')`),
    check("dues_amount_check", sql`${t.amountDuePaise} >= 0`),
    index("dues_gym_status_idx").on(t.gymId, t.status),
    index("dues_gym_due_date_idx").on(t.gymId, t.dueDate),
    index("dues_member_idx").on(t.memberId),
  ],
);
