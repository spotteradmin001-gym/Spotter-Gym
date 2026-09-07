import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { users } from "./auth";
import { gyms } from "./gyms";

/**
 * Gym members (Phase 3 Batch 3.2).
 *
 * A member row exists from the moment staff add the person. `userId` stays null
 * until they activate a login (Phase 5). `monthlyFeePaise` null means "use the
 * gym's default fee". `billingAnchorDay` is the day of month their due lands on
 * when the gym bills per-member (ignored when the gym bills on a fixed day).
 * `profile` holds the answers to the owner's `member_profile_fields`, keyed by
 * field `key`.
 */
export const members = pgTable(
  "members",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    joinDate: date("join_date").notNull(),
    monthlyFeePaise: integer("monthly_fee_paise"),
    billingAnchorDay: integer("billing_anchor_day").notNull().default(1),
    status: text("status").notNull().default("active"),
    profile: jsonb("profile").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("members_gym_phone_unique").on(t.gymId, t.phone),
    check("members_status_check", sql`${t.status} in ('active', 'inactive')`),
    check(
      "members_billing_anchor_day_check",
      sql`${t.billingAnchorDay} between 1 and 28`,
    ),
    index("members_gym_id_idx").on(t.gymId),
    index("members_gym_status_idx").on(t.gymId, t.status),
  ],
);

/**
 * One-time link a member uses to set their login (Phase 5 Batch 5.1). Only the
 * SHA-256 hash is stored; the raw token lives in the emailed / WhatsApp link.
 * Single-use, 7-day expiry.
 */
export const memberActivationTokens = pgTable(
  "member_activation_tokens",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("member_activation_tokens_member_idx").on(t.memberId)],
);
