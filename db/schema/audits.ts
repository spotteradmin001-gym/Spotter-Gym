import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { gyms } from "./gyms";
import { users } from "./auth";

/**
 * Append-only audit trail (Phase 7). One row per meaningful mutation: who did
 * it, what, to which record. `gymId` is null for admin-level actions.
 * `targetId` is a free string (the affected row's id). `meta` holds a small
 * JSON snapshot of what changed.
 *
 * No foreign key on `targetId` — the target may be any table and may later be
 * deleted; the log must outlive it. `actorUserId` keeps a FK (set null) so a
 * deleted staff account doesn't orphan-block, but the row stays.
 */
export const audits = pgTable(
  "audits",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id").references(() => gyms.id, { onDelete: "set null" }),
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audits_gym_created_idx").on(t.gymId, t.createdAt),
    index("audits_actor_idx").on(t.actorUserId),
  ],
);
