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

import { dues } from "./dues";
import { gyms } from "./gyms";
import { members } from "./members";

/**
 * The earned attendance-reward ledger (Phase E / CR-9, 9d).
 *
 * One row per member per billing cycle that has been scored. `earnedPeriod` and
 * `redeemPeriod` are period-month dates (`YYYY-MM-01`), matching
 * `dues.period_month`. Redemption is always cycle N+2: `redeemPeriod` is
 * `earnedPeriod` plus two calendar months.
 *
 * `status`:
 *   - `earned`  — the member had a clean streak across that cycle's open days
 *                 (minus the gym's allowed-misses buffer). A pending credit.
 *   - `applied` — the credit has been taken off the `redeemPeriod` due
 *                 (`appliedDueId`), once.
 *   - `missed`  — the streak broke that cycle; kept as a visible "no reward"
 *                 record so the treasure chest can show a reset state.
 *
 * `percent` is captured at evaluation time (like the due amount) so a later
 * change to `gyms.streak_reward_percent` never rewrites history. A gym with
 * `streak_reward_percent = 0` produces no rows at all — the feature is inert.
 *
 * Idempotent via `unique(member_id, earned_period)`.
 */
export const streakRewards = pgTable(
  "streak_rewards",
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
    earnedPeriod: date("earned_period").notNull(),
    redeemPeriod: date("redeem_period").notNull(),
    percent: integer("percent").notNull(),
    status: text("status").notNull().default("earned"),
    appliedDueId: text("applied_due_id").references(() => dues.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("streak_rewards_member_earned_unique").on(t.memberId, t.earnedPeriod),
    check(
      "streak_rewards_status_check",
      sql`${t.status} in ('earned', 'applied', 'missed')`,
    ),
    check("streak_rewards_percent_check", sql`${t.percent} between 0 and 100`),
    index("streak_rewards_gym_status_idx").on(t.gymId, t.status),
    index("streak_rewards_gym_redeem_idx").on(t.gymId, t.redeemPeriod),
    index("streak_rewards_member_idx").on(t.memberId),
  ],
);
