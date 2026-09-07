import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  integer,
  pgTable,
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
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("gyms_reminder_days_before_check", sql`${t.reminderDaysBefore} between 0 and 30`),
    check("gyms_checkin_radius_check", sql`${t.checkinRadiusM} between 10 and 5000`),
    check("gyms_billing_anchor_mode_check", sql`${t.billingAnchorMode} in ('per_member', 'fixed')`),
    check("gyms_billing_anchor_day_check", sql`${t.billingAnchorDay} between 1 and 28`),
  ],
);
