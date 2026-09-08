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
 * Queued WhatsApp reminders (Phase 6 Batch 6.1). The in-app planner writes
 * these; the local sender script (Batch 6.2) reads `pending` rows whose
 * `scheduledFor <= today`, sends via the laptop's WAHA, and writes the result
 * back. The dashboard only ever reads this table — moving the sender to hosting
 * later needs no dashboard change.
 *
 * `unique(due_id, kind)` makes the planner idempotent: at most one `pre_due`
 * and one `on_due` job per due.
 */
export const reminderJobs = pgTable(
  "reminder_jobs",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    gymId: text("gym_id")
      .notNull()
      .references(() => gyms.id, { onDelete: "restrict" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    dueId: text("due_id")
      .notNull()
      .references(() => dues.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    scheduledFor: date("scheduled_for").notNull(),
    status: text("status").notNull().default("pending"),
    wahaSession: text("waha_session"),
    messageText: text("message_text").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    wahaMessageId: text("waha_message_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("reminder_jobs_due_kind_unique").on(t.dueId, t.kind),
    check("reminder_jobs_kind_check", sql`${t.kind} in ('pre_due', 'on_due')`),
    check(
      "reminder_jobs_status_check",
      sql`${t.status} in ('pending', 'sent', 'failed', 'skipped')`,
    ),
    index("reminder_jobs_send_queue_idx").on(t.status, t.scheduledFor),
    index("reminder_jobs_gym_status_idx").on(t.gymId, t.status),
    index("reminder_jobs_member_idx").on(t.memberId),
  ],
);
