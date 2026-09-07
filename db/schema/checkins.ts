import { sql } from "drizzle-orm";
import {
  check,
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { gyms } from "./gyms";
import { members } from "./members";

/**
 * QR check-ins (Phase 5 Batch 5.2). `checkinDate` (the gym-local calendar day)
 * plus `unique(member_id, checkin_date)` gives same-day dedupe. `distanceM` is
 * how far the phone was from the gym fence when it scanned.
 */
export const checkins = pgTable(
  "checkins",
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
    checkedInAt: timestamp("checked_in_at", { withTimezone: true }).notNull().defaultNow(),
    checkinDate: date("checkin_date").notNull(),
    method: text("method").notNull().default("qr"),
    geoLat: doublePrecision("geo_lat"),
    geoLng: doublePrecision("geo_lng"),
    distanceM: integer("distance_m"),
  },
  (t) => [
    unique("checkins_member_day_unique").on(t.memberId, t.checkinDate),
    check("checkins_method_check", sql`${t.method} in ('qr')`),
    index("checkins_gym_date_idx").on(t.gymId, t.checkinDate),
    index("checkins_member_idx").on(t.memberId),
  ],
);
