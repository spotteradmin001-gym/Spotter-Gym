import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { gyms } from "./gyms";

/**
 * Per-gym, per-day tally of WhatsApp messages the local engine has sent from a
 * gym's session (Phase F / CR-10). One row per `(gym_id, sent_on, kind)`.
 *
 * `kind`:
 *   - `reminder`   — payment-reminder sends (`engine/send-reminders.mjs`)
 *   - `activation` — new-member activation sends
 *   - `promo`      — bulk promotion sends (`engine/send-promotions.mjs`)
 *
 * `reminder` + `activation` are the transactional traffic the promo budget
 * subtracts. The engine computes a day's promo budget as
 * `gyms.waha_daily_cap - gyms.transactional_reserve - (today's reminder +
 * activation count)` and stops promo sends for the day when it hits zero.
 *
 * `unique(gym_id, sent_on, kind)` makes the engine's increment an upsert.
 */
export const wahaSendLog = pgTable(
  "waha_send_log",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "cascade" }),
    sentOn: date("sent_on").notNull(),
    kind: text("kind").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("waha_send_log_gym_day_kind_unique").on(t.gymId, t.sentOn, t.kind),
    check(
      "waha_send_log_kind_check",
      sql`${t.kind} in ('reminder', 'activation', 'promo')`,
    ),
    check("waha_send_log_count_check", sql`${t.count} >= 0`),
    index("waha_send_log_gym_day_idx").on(t.gymId, t.sentOn),
  ],
);
