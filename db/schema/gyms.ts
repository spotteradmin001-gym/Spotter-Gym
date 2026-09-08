import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Phase 2 — one row per gym (one tenant). An admin creates these; an owner
 * account is then attached via `users.gym_id`.
 *
 * `name` and `timezone` are set at creation. Everything else — address, geo
 * fence, fees, WAHA session, reminder lead time — is filled in later from the
 * owner settings screen (Phase 3 Batch 3.1), so it is all nullable or
 * defaulted here.
 *
 * Money: `default_monthly_fee_paise` is an integer in paise (₹1 = 100), the
 * repo-wide convention for INR amounts. Geo: `doublePrecision` degrees;
 * `checkin_radius_m` is metres.
 *
 * Soft delete only — `is_active` flips, rows are never dropped, so payment and
 * attendance history stays intact.
 */
export const gyms = pgTable(
  "gyms",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    timezone: text("timezone").notNull().default("Asia/Kolkata"),
    address: text("address"),
    geoLat: doublePrecision("geo_lat"),
    geoLng: doublePrecision("geo_lng"),
    checkinRadiusM: integer("checkin_radius_m").notNull().default(100),
    wahaSessionName: text("waha_session_name"),
    defaultMonthlyFeePaise: integer("default_monthly_fee_paise"),
    // How a member's monthly due date is decided: 'per_member' uses each
    // member's own billing_anchor_day; 'fixed' bills everyone on
    // billing_anchor_day below. (Open question #4: no proration either way —
    // the first full period starts on the next anchor day.)
    billingAnchorMode: text("billing_anchor_mode").notNull().default("per_member"),
    billingAnchorDay: integer("billing_anchor_day").notNull().default(1),
    reminderDaysBefore: integer("reminder_days_before").notNull().default(3),
    // Member streak gamification (Phase E / CR-9). `closedWeekdays` holds the
    // JS `getDay()` numbers the gym is normally shut (0 = Sunday), default
    // `{0}`. A closed day never requires a check-in and never breaks a streak.
    // `streakRewardPercent` 0 = the whole attendance-reward feature is off for
    // this gym (no separate enable flag). `streakAllowedMisses` is the per
    // billing-cycle buffer of missed open days a member is still forgiven.
    closedWeekdays: smallint("closed_weekdays")
      .array()
      .notNull()
      .default(sql`'{0}'::smallint[]`),
    streakRewardPercent: integer("streak_reward_percent").notNull().default(0),
    streakAllowedMisses: integer("streak_allowed_misses").notNull().default(0),
    // Paid WhatsApp promotions (Phase F / CR-10). `wahaDailyCap` is the total
    // messages/day this gym's WhatsApp number may safely send (200 for a warmed
    // number, ~40 for a fresh one). `transactionalReserve` is headroom held
    // back for payment reminders + activation messages that promotions can
    // never eat into. Promo budget for a day = cap - reserve - today's
    // transactional sends. Both are admin-configurable only.
    wahaDailyCap: integer("waha_daily_cap").notNull().default(200),
    transactionalReserve: integer("transactional_reserve").notNull().default(60),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("gyms_reminder_days_before_check", sql`${t.reminderDaysBefore} between 0 and 30`),
    check("gyms_checkin_radius_check", sql`${t.checkinRadiusM} between 10 and 5000`),
    check("gyms_billing_anchor_mode_check", sql`${t.billingAnchorMode} in ('per_member', 'fixed')`),
    check("gyms_billing_anchor_day_check", sql`${t.billingAnchorDay} between 1 and 28`),
    check(
      "gyms_streak_reward_percent_check",
      sql`${t.streakRewardPercent} between 0 and 100`,
    ),
    check(
      "gyms_streak_allowed_misses_check",
      sql`${t.streakAllowedMisses} between 0 and 31`,
    ),
    check("gyms_waha_daily_cap_check", sql`${t.wahaDailyCap} between 1 and 2000`),
    check(
      "gyms_transactional_reserve_check",
      sql`${t.transactionalReserve} between 0 and 2000`,
    ),
  ],
);
