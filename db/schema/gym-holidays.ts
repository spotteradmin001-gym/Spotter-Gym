import { sql } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { gyms } from "./gyms";

/**
 * One-off days the gym is closed (Phase E / CR-9), on top of the weekly
 * `gyms.closed_weekdays` pattern. A holiday behaves exactly like a weekly
 * closed day for streak scoring: it neither requires a check-in nor breaks a
 * streak. `date` is the gym-local calendar day. `unique(gym_id, date)` keeps
 * the list clean and makes add idempotent-ish (a second add of the same day
 * fails loudly rather than duplicating).
 *
 * Editing this list is locked per billing cycle — see
 * `db/queries/schedule.ts` — so a member cannot have a missed open day
 * retroactively marked a holiday.
 */
export const gymHolidays = pgTable(
  "gym_holidays",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    label: text("label").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("gym_holidays_gym_date_unique").on(t.gymId, t.date),
    index("gym_holidays_gym_idx").on(t.gymId),
  ],
);
