import { sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { users } from "./auth";
import { dues } from "./dues";
import { gyms } from "./gyms";
import { members } from "./members";

/**
 * Recorded payments (Phase 3 Batch 3.4). Staff mark payments here — there is no
 * payment gateway.
 *
 * A payment is a single amount against a member. `dueId` points at the oldest
 * pending due it started settling (informational; may be null). Which dues are
 * actually "paid" is derived by walking the member's dues oldest-first against
 * their total paid — so a partial payment leaves a due pending and an overpay
 * rolls onto the next one.
 */
export const payments = pgTable(
  "payments",
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
    dueId: text("due_id").references(() => dues.id, { onDelete: "set null" }),
    amountPaise: integer("amount_paise").notNull(),
    paidOn: date("paid_on").notNull(),
    method: text("method").notNull().default("cash"),
    recordedBy: text("recorded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("payments_amount_check", sql`${t.amountPaise} > 0`),
    check(
      "payments_method_check",
      sql`${t.method} in ('cash', 'upi', 'card', 'bank', 'other')`,
    ),
    index("payments_gym_paid_on_idx").on(t.gymId, t.paidOn),
    index("payments_member_idx").on(t.memberId),
  ],
);
